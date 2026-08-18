/// <reference path="../@types/spicetify.d.ts" />

/**
 * Baseado no songstats de CharlieS1103, com a FONTE DE DADOS trocada.
 *
 * Contexto: neste client, api.spotify.com responde 429 em toda requisição, e o
 * endpoint /v1/audio-features foi descontinuado pelo Spotify em 27/11/2024.
 * Por isso os dados vêm do Spicetify.GraphQL (pathfinder), a API interna que o
 * próprio app usa. Os gêneros vêm do MusicBrainz, porque o pathfinder não
 * expõe esse campo em lugar nenhum (verificado no artistUnion).
 *
 * Os gêneros são do ARTISTA, não da faixa - o Spotify nunca classificou
 * faixas individualmente por gênero.
 */

(function songstats() {
    const DEBUG = true;

    const { GraphQL, ContextMenu, URI, PopupModal } = Spicetify;
    if (
        !(
            GraphQL &&
            GraphQL.Request &&
            GraphQL.Definitions &&
            URI &&
            PopupModal &&
            ContextMenu
        )
    ) {
        setTimeout(songstats, 300);
        return;
    }

    // ---- Traduções ---------------------------------------------------------
    const translations = {
        en: {
            titletxt: "Song Stats",
            buttontxt: "View Song Stats",
            track: "Track",
            artist: "Artist",
            album: "Album",
            plays: "Plays",
            duration: "Duration",
            explicit: "Explicit",
            yes: "Yes",
            no: "No",
            releaseDate: "Release Date",
            label: "Record Label",
            totalTracks: "Tracks on album",
            followers: "Artist Followers",
            monthly: "Monthly Listeners",
            genres: "Genres",
            unknown: "Unknown",
            error: "Could not load song info.",
        },
        pt: {
            titletxt: "Estatísticas da Música",
            buttontxt: "Ver Estatísticas da Música",
            track: "Faixa",
            artist: "Artista",
            album: "Álbum",
            plays: "Reproduções",
            duration: "Duração",
            explicit: "Explícita",
            yes: "Sim",
            no: "Não",
            releaseDate: "Lançamento",
            label: "Gravadora",
            totalTracks: "Faixas no álbum",
            followers: "Seguidores do artista",
            monthly: "Ouvintes mensais",
            genres: "Gêneros",
            unknown: "Desconhecido",
            error: "Não foi possível obter as informações.",
        },
        es: {
            titletxt: "Estadísticas de la canción",
            buttontxt: "Ver estadísticas de la canción",
            track: "Canción",
            artist: "Artista",
            album: "Álbum",
            plays: "Reproducciones",
            duration: "Duración",
            explicit: "Explícita",
            yes: "Sí",
            no: "No",
            releaseDate: "Fecha de lanzamiento",
            label: "Sello discográfico",
            totalTracks: "Canciones en el álbum",
            followers: "Seguidores del artista",
            monthly: "Oyentes mensuales",
            genres: "Géneros",
            unknown: "Desconocido",
            error: "No se pudo obtener la información.",
        },
        fr: {
            titletxt: "Statistiques de la musique",
            buttontxt: "Voir les statistiques de la musique",
            track: "Titre",
            artist: "Artiste",
            album: "Album",
            plays: "Écoutes",
            duration: "Durée",
            explicit: "Explicite",
            yes: "Oui",
            no: "Non",
            releaseDate: "Date de sortie",
            label: "Label",
            totalTracks: "Titres dans l'album",
            followers: "Abonnés de l'artiste",
            monthly: "Auditeurs mensuels",
            genres: "Genres",
            unknown: "Inconnu",
            error: "Impossible de récupérer les informations.",
        },
        de: {
            titletxt: "Songstatistiken",
            buttontxt: "Songstatistiken anzeigen",
            track: "Titel",
            artist: "Künstler",
            album: "Album",
            plays: "Wiedergaben",
            duration: "Dauer",
            explicit: "Explizit",
            yes: "Ja",
            no: "Nein",
            releaseDate: "Veröffentlichung",
            label: "Plattenlabel",
            totalTracks: "Titel im Album",
            followers: "Follower",
            monthly: "Monatliche Hörer",
            genres: "Genres",
            unknown: "Unbekannt",
            error: "Informationen konnten nicht geladen werden.",
        },
        cs: {
            titletxt: "Statistiky písně",
            buttontxt: "Zobrazit statistiky písně",
            track: "Skladba",
            artist: "Interpret",
            album: "Album",
            plays: "Přehrání",
            duration: "Délka",
            explicit: "Explicitní",
            yes: "Ano",
            no: "Ne",
            releaseDate: "Datum vydání",
            label: "Vydavatelství",
            totalTracks: "Skladeb v albu",
            followers: "Sledující",
            monthly: "Měsíční posluchači",
            genres: "Žánry",
            unknown: "Neznámé",
            error: "Informace se nepodařilo načíst.",
        },
    };
    translations["pt-BR"] = translations.pt;
    translations["fr-CA"] = translations.fr;
    translations["es-419"] = translations.es;

    const locale = (Spicetify.Locale && Spicetify.Locale._locale) || "en";
    const T =
        translations[locale] ||
        translations[locale.split("-")[0]] ||
        translations.en;
    const numLocale = locale;

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function formatNumber(n) {
        if (
            typeof n === "number" ||
            (typeof n === "string" && n !== "" && !isNaN(n))
        ) {
            return Number(n).toLocaleString(numLocale);
        }
        return null;
    }

    function formatDuration(ms) {
        if (!ms) return null;
        const seconds = Math.floor(ms / 1000);
        return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
    }

    function parseDate(iso) {
        if (!iso) return null;
        const date = new Date(iso);
        return isNaN(date.getTime())
            ? String(iso).slice(0, 10)
            : date.toLocaleDateString(numLocale);
    }

    function findNested(data, key, depth = 0) {
        if (!data || typeof data !== "object" || depth > 8) return;
        if (key in data && data[key] != null) return data[key];
        for (const k in data) {
            const result = findNested(data[k], key, depth + 1);
            if (result !== undefined) return result;
        }
    }

    function findByUri(data, prefix, depth = 0) {
        if (!data || typeof data !== "object" || depth > 10) return;
        if (typeof data.uri === "string" && data.uri.startsWith(prefix))
            return data;
        for (const key in data) {
            const result = findByUri(data[key], prefix, depth + 1);
            if (result) return result;
        }
    }

    function entityName(node) {
        if (!node) return undefined;
        if (typeof node.name === "string") return node.name;
        if (node.profile && typeof node.profile.name === "string")
            return node.profile.name;
        return undefined;
    }

    function getTrackCount(album) {
        if (!album) return null;
        for (const field of ["tracksV2", "tracks"]) {
            const tracks = findNested(album, field);
            if (tracks?.totalCount) return tracks.totalCount;
        }
    }

    async function query(name, variables) {
        const def = GraphQL.Definitions[name];
        if (!def)
            throw new Error(
                `Query "${name}" não existe nesta versão do Spicetify`,
            );
        const response = await GraphQL.Request(def, variables);
        if (DEBUG) console.log(`[songstats] ${name} →`, response);
        if (response && response.errors && response.errors.length) {
            throw new Error(
                `${name}: ${response.errors[0].message || "erro no pathfinder"}`,
            );
        }
        return response && response.data ? response.data : response;
    }

    async function safeQuery(name, variables) {
        try {
            return await query(name, variables);
        } catch (error) {
            // Log da falha mas não interrompe o fluxo
            console.warn(
                `[songstats] ${name} falhou:`,
                error && error.message ? error.message : error,
            );
            return null;
        }
    }

    // ---- Gêneros via MusicBrainz
    const genreCache = new Map();

    function formatTags(tags) {
        if (!Array.isArray(tags) || !tags.length) return null;
        return (
            tags
                .filter((tag) => tag?.name && (tag.count || 0) > 0)
                .sort((a, b) => (b.count || 0) - (a.count || 0))
                .slice(0, 4)
                .map(
                    (tag) =>
                        tag.name.charAt(0).toUpperCase() + tag.name.slice(1),
                )
                .join(", ") || null
        );
    }

    async function searchMusicBrainz(query, retries = 2) {
        const url = `https://musicbrainz.org/ws/2/artist/?fmt=json&limit=1&query=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (res.status === 503 && retries > 0) {
            await sleep(1200);
            return searchMusicBrainz(query, retries - 1);
        }
        if (!res.ok) throw new Error(`MusicBrainz HTTP ${res.status}`);
        const data = await res.json();
        return data.artists?.[0] || null;
    }

    async function getArtistGenres(name) {
        if (!name) return null;
        if (genreCache.has(name)) return genreCache.get(name);

        try {
            let artist = await searchMusicBrainz(
                `artist:"${name.replace(/"/g, "")}"`,
            );
            if (!artist) artist = await searchMusicBrainz(name);
            if (!artist)
                throw new Error("artista não encontrado no MusicBrainz");

            let genres = formatTags(artist.tags);
            if (!genres && artist.id) {
                const res = await fetch(
                    `https://musicbrainz.org/ws/2/artist/${artist.id}?fmt=json&inc=genres+tags`,
                );
                if (res.ok) {
                    const data = await res.json();
                    genres = formatTags(data.genres) || formatTags(data.tags);
                }
            }
            if (!genres) throw new Error("sem gêneros cadastrados");

            genreCache.set(name, genres);
            return genres;
        } catch (e) {
            console.warn("[songstats] gêneros:", e?.message || e);
            genreCache.set(name, null);
            return null;
        }
    }

    async function getSongStats(uris) {
        try {
            const trackUri = uris[0];
            let locale = "en";
            if (Spicetify.Locale && Spicetify.Locale.getLocale) {
                locale = Spicetify.Locale.getLocale();
            }

            const trackData = await query("getTrack", { uri: trackUri });
            const track = findNested(trackData, "trackUnion") || trackData;

            const trackName = findNested(track, "name");
            const playcount = findNested(track, "playcount");
            const durationMs = findNested(track, "totalMilliseconds");
            const contentRating = findNested(track, "contentRating");

            const album = findByUri(track, "spotify:album:");
            const albumName = entityName(album);
            const releaseDate = album ? findNested(album, "isoString") : null;

            const artist = findByUri(track, "spotify:artist:");
            const artistName = entityName(artist);

            const albumData = album
                ? await safeQuery("getAlbum", {
                      uri: album.uri,
                      locale,
                      offset: 0,
                      limit: 50,
                  })
                : null;

            const artistData = artist
                ? await safeQuery("queryArtistOverview", {
                      uri: artist.uri,
                      locale,
                      includePrerelease: false,
                  })
                : null;

            const label = albumData ? findNested(albumData, "label") : null;
            const totalTracks = getTrackCount(albumData);

            let followers, monthly;
            if (artistData) {
                const stats = findNested(artistData, "stats");
                if (stats) {
                    followers = stats.followers;
                    monthly = stats.monthlyListeners;
                } else {
                    followers = findNested(artistData, "followers");
                    monthly = findNested(artistData, "monthlyListeners");
                }
            }

            const genres = await getArtistGenres(artistName);

            const isExplicit = contentRating
                ? String(findNested(contentRating, "label")).toUpperCase() ===
                  "EXPLICIT"
                    ? T.yes
                    : T.no
                : null;

            const rows = [
                [T.track, trackName],
                [T.artist, artistName],
                [T.album, albumName],
                [T.plays, formatNumber(playcount)],
                [T.duration, formatDuration(durationMs)],
                [T.explicit, isExplicit],
                [T.releaseDate, parseDate(releaseDate)],
                [T.label, label],
                [T.totalTracks, totalTracks ? String(totalTracks) : null],
                [T.followers, formatNumber(followers)],
                [T.monthly, formatNumber(monthly)],
                // Sempre exibida: cai para o texto de "desconhecido" quando o
                // MusicBrainz não retorna nada, em vez de sumir da lista.
                [T.genres, genres || T.unknown],
            ].filter(([, v]) => v != null && v !== "");

            if (!rows.length) throw new Error("nenhum campo pôde ser extraído");

            const rowsHtml = rows
                .map(
                    ([label, value]) => `
					<div class="stats-row">
						<div class="stats-cell">${label}:&nbsp;</div>
						<div class="stats-cell">${value}</div>
					</div>`,
                )
                .join("");

            PopupModal.display({
                title: T.titletxt,
                content: `<style>
					.stats-table { display: table; width: 100%; border-collapse: collapse; }
					.stats-row { display: table-row; }
					.stats-cell { display: table-cell; padding: 3px 4px; font-weight: 550; color: var(--spice-text); }
					.stats-cell:nth-child(even) { font-weight: 400; }
				</style>
				<div class="stats-table">${rowsHtml}</div>`,
            });
        } catch (error) {
            console.error("[songstats] erro:", error);
            Spicetify.showNotification(
                `${T.error} ${error && error.message ? `(${error.message})` : ""}`,
                true,
            );
        }
    }

    const shouldDisplayContextMenu = (uris) => {
        if (uris.length > 1) return false;
        return (
            Spicetify.URI.fromString(uris[0]).type === Spicetify.URI.Type.TRACK
        );
    };

    const statsIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="main-contextMenu-menuItemIcon">
		<path d="M18 20V10"></path>
		<path d="M12 20V4"></path>
		<path d="M6 20v-6"></path>
	</svg>`;

    new ContextMenu.Item(
        T.buttontxt,
        getSongStats,
        shouldDisplayContextMenu,
        statsIcon,
    ).register();
})();

# Save Spotify Playlists By Genre

Robô que lê uma playlist principal do Spotify e distribui suas músicas em playlists separadas por gênero musical — criando as playlists que ainda não existem.

O projeto tem **duas peças que dependem uma da outra**:

| Peça | O quê |
| --- | --- |
| Automação **UiPath** | Lê a playlist, guarda tudo no PostgreSQL e opera a interface do Spotify para montar as playlists de gênero |
| Extensão **Spicetify** (`songinfo.js`) | Injeta no app do Spotify um menu "View Song Stats" que expõe o **gênero** de cada faixa — é daí que o robô extrai a informação |

Sem a extensão instalada, o robô não tem de onde tirar os gêneros e o processo não funciona.

## Como funciona

```
┌─ 1. Extrair ──────────────────────────────────────────────┐
│  Main.xaml abre a "Playlist Soberana" no app do Spotify,  │
│  rola a lista inteira, limpa título/artista/data/duração  │
│  e grava tudo em spotify.playlist_soberana (PostgreSQL)   │
└───────────────────────────┬───────────────────────────────┘
                            ▼
┌─ 2. Descobrir gêneros ────────────────────────────────────┐
│  Para cada música ainda sem gênero: clique direito →      │
│  "View Song Stats" (extensão Spicetify) → lê os gêneros   │
│  do popup → grava em genre_1, genre_2, genre_N...         │
└───────────────────────────┬───────────────────────────────┘
                            ▼
┌─ 3. Montar as playlists ──────────────────────────────────┐
│  Adicionar músicas nas playlists.xaml percorre cada slot  │
│  de gênero, cria a playlist se ela não existir e adiciona │
│  cada música, marcando o progresso em bol_genre_N         │
└───────────────────────────────────────────────────────────┘
```

### Por que existe uma extensão no meio disso

O caminho óbvio seria a Web API do Spotify. Ele não funciona aqui, por dois motivos registrados no cabeçalho do `songinfo.js`:

- `api.spotify.com` responde **HTTP 429** em toda requisição feita a partir deste client;
- o endpoint `/v1/audio-features` foi **descontinuado pelo Spotify em 27/11/2024**.

A extensão contorna isso usando o **`Spicetify.GraphQL` (pathfinder)** — a API interna que o próprio app do Spotify consome — para faixa, álbum e artista. Os **gêneros**, porém, o pathfinder não expõe em campo nenhum (verificado no `artistUnion`), então eles vêm do **[MusicBrainz](https://musicbrainz.org/)**: as 4 tags mais votadas do artista.

> **Importante:** os gêneros são do **artista**, não da faixa. O Spotify nunca classificou faixas individualmente por gênero.

## Estrutura do repositório

| Caminho | Descrição |
| --- | --- |
| `Main.xaml` | Workflow principal e ponto de entrada: extração da playlist + descoberta de gêneros |
| `Adicionar músicas nas playlists.xaml` | Criação das playlists de gênero e inserção das músicas |
| [`Extensão Spicetify/songinfo.js`](Extens%C3%A3o%20Spicetify/songinfo.js) | Extensão do Spotify que expõe os gêneros no menu de contexto |
| `project.json`, `project.uiproj`, `entry-points.json` | Configuração e metadados do projeto UiPath |
| `LICENSE` | Licença MIT |

As pastas `.screenshots/`, `.storage/`, `.objects/`, `.settings/` e `.project/` são artefatos de *design-time* gerados pelo UiPath Studio (capturas dos seletores, estado da UI, metadados de pacotes). Não precisam ser editadas à mão.

## Pré-requisitos

- **[UiPath Studio](https://www.uipath.com/product/studio)** 26.0.181 ou superior, em Windows
- **Spotify Premium**, aplicativo **desktop** (o robô automatiza `spotify.exe`, não o player web)
  - a interface precisa estar em **inglês** — os seletores foram capturados sobre rótulos como *Add to playlist*, *Already added*, *Don't add*, *Create*, *Save* e *Go back*
- **[Spicetify](https://spicetify.app/)** instalado e aplicado
- **PostgreSQL** acessível, com um schema chamado `spotify`
- Biblioteca UiPath **`db_postgres` 1.0.13** disponível no feed de pacotes

### Dependências declaradas (`project.json`)

| Pacote | Versão |
| --- | --- |
| `db_postgres` | `1.0.13` |
| `UiPath.System.Activities` | `25.10.3` |
| `UiPath.UIAutomation.Activities` | `25.10.21` |

## Instalação

### 1. Extensão Spicetify

Descubra a pasta de dados do Spicetify:

```bash
spicetify path userdata
```

Copie `songinfo.js` para `<caminho retornado>\Extensions\songinfo.js` e registre a extensão:

```bash
spicetify config extensions songinfo.js
```

```bash
spicetify apply
```

Para conferir: abra o Spotify, clique com o botão direito em qualquer faixa e verifique se aparece **"View Song Stats"** (ou "Ver Estatísticas da Música", conforme o idioma do app). O popup deve listar uma linha de **Gêneros**.

A extensão é traduzida para inglês, português, espanhol, francês, alemão e tcheco, seguindo o idioma configurado no Spotify.

### 2. Banco de dados

Crie o schema, se ainda não existir:

```sql
CREATE SCHEMA IF NOT EXISTS spotify;
```

A tabela `spotify.playlist_soberana` e suas colunas de gênero são criadas e estendidas pelo próprio robô — veja a seção abaixo.

### 3. Projeto UiPath

Abra a pasta do repositório no UiPath Studio, restaure as dependências e configure a conexão do `db_postgres` com sua instância PostgreSQL.

## Banco de dados

Tudo vive em uma única tabela, `spotify.playlist_soberana`.

**Colunas fixas:**

| Coluna | Tipo | Conteúdo |
| --- | --- | --- |
| `index` | `int` | Posição da música na playlist de origem |
| `title` | `varchar` | Título já limpo (primeira linha do texto extraído) |
| `artist` | `varchar` | Artista já limpo (sem "Music video", vírgulas e espaços extras) |
| `album` | `varchar` | Álbum |
| `date_added` | `varchar` | Data de adição, convertida de relativa ("2 weeks ago") para absoluta |
| `duration` | `varchar` | Duração normalizada para `00:mm:ss` |

**Colunas dinâmicas:** o robô executa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` conforme encontra músicas com mais gêneros. Para cada slot `N` são criadas duas colunas:

| Coluna | Tipo | Conteúdo |
| --- | --- | --- |
| `genre_N` | `varchar` | Nome do N-ésimo gênero da música |
| `bol_genre_N` | `integer` | Estado do processamento desse gênero |

Valores de `bol_genre_N`:

| Valor | Significado |
| --- | --- |
| `NULL` ou `< 1` | Pendente — ainda será adicionada à playlist |
| `1` | Adicionada com sucesso |
| `2` | Já estava na playlist; o robô escolheu "Don't add" |

Casos especiais em `genre_N`: o valor literal `'NULL'` marca uma música cujos gêneros não puderam ser resolvidos, e `'Unknown'` vem do fallback da extensão. Ambos são ignorados na etapa de montagem das playlists, para não gerar playlists lixo.

Esse controle por coluna é o que torna o processo **retomável**: se a execução for interrompida, basta rodar de novo — só o que ficou pendente é reprocessado.

## Execução

1. Abra o Spotify desktop e faça login.
2. Abra o projeto no UiPath Studio.
3. Execute **`Main.xaml`**.

`Main.xaml` chama `Adicionar músicas nas playlists.xaml` ao final — não é preciso executar o segundo workflow separadamente.

Alguns comportamentos esperados durante a execução:

- O robô só re-extrai a playlist inteira quando a contagem de músicas na tela difere da contagem no banco; caso contrário, aproveita o que já está gravado.
- Quando re-extrai, ele faz `TRUNCATE` na tabela antes de reinserir tudo.
- Como é automação de interface, **a máquina fica ocupada**: o robô move o mouse, rola listas e abre menus no Spotify. Não use o computador durante a execução.

## Limitações conhecidas

- **A playlist de origem é fixa.** O nome "Playlist Soberana" está embutido nos seletores e nos scripts SQL. Apontar para outra playlist exige editar os workflows.
- **Os seletores são frágeis por natureza.** Foram capturados de uma versão e um idioma específicos do Spotify; atualizações do app ou mudança de idioma da interface tendem a quebrá-los.
- **Gêneros são do artista, não da faixa** (via MusicBrainz). Artistas ecléticos produzem classificações imprecisas, e artistas obscuros podem não ter tags cadastradas.
- **O SQL é montado por concatenação de strings**, com escape apenas de aspas simples. Funciona para o caso de uso, mas não é robusto contra entradas inesperadas.
- **`db_postgres` é uma biblioteca própria**, não um pacote público do feed oficial do UiPath. Quem clonar o repositório precisa disponibilizá-la no próprio feed.
- **A extensão roda com `DEBUG = true`**, registrando as respostas do pathfinder no console do Spotify. Para silenciar, altere a constante no topo do `songinfo.js`.

## Créditos

- A extensão é baseada no **songstats**, de [CharlieS1103](https://github.com/CharlieS1103), com a fonte de dados substituída.
- Gêneros fornecidos pelo **[MusicBrainz](https://musicbrainz.org/)**.
- Construída sobre o **[Spicetify](https://spicetify.app/)**.

## Licença

Este projeto está licenciado sob a licença MIT — veja o arquivo [LICENSE](LICENSE) para mais detalhes.

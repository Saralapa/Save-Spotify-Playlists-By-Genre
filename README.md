# Save Spotify Playlists By Genre

Automação em **UiPath** para salvar playlists no Spotify com base nos gêneros das músicas.

## Descrição

Este projeto lê as músicas de uma playlist principal do Spotify e as organiza em novas playlists separadas por gênero musical, facilitando a curadoria e a organização da biblioteca do usuário.

## Tecnologia

- **UiPath Studio** — projeto de RPA (Robotic Process Automation)
- **UiPath.UIAutomation.Activities** — automação da interface do Spotify
- **db_postgres** — integração com banco de dados PostgreSQL para persistência de dados
- **UiPath.System.Activities** — atividades de sistema utilizadas no fluxo

## Estrutura do projeto

- `Main.xaml` — workflow principal, ponto de entrada do processo
- `Adicionar músicas nas playlists.xaml` — workflow responsável por adicionar as músicas às playlists de destino
- `project.json` / `project.uiproj` / `entry-points.json` — arquivos de configuração e metadados do projeto UiPath

## Pré-requisitos

- [UiPath Studio](https://www.uipath.com/product/studio) instalado
- Conta no Spotify
- Instância do PostgreSQL configurada e acessível

## Como executar

1. Abra o projeto no UiPath Studio.
2. Configure a conexão com o banco de dados PostgreSQL, se necessário.
3. Execute o workflow `Main.xaml`.

## Licença

Este projeto está licenciado sob a licença MIT — veja o arquivo [LICENSE](LICENSE) para mais detalhes.

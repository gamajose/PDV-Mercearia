# PDV Gama

PDV Windows local-first para pequenos comércios e redes com várias lojas.

## Como funciona

Cada loja possui uma máquina principal com o **PDV Central**. Ela instala:

- o serviço local da loja;
- o banco SQLite da loja;
- a aplicação administrativa e de caixa;
- a API usada pelos demais computadores da mesma rede.

Os demais computadores usam o **PDV Terminal**, que se conecta ao PDV Central pela rede local.

Se existirem várias lojas, cada uma continua operando de forma independente mesmo sem internet. O nó central de cada filial envia eventos administrativos para o nó administrador quando a conexão estiver disponível. Estoque, caixa e sequência de venda permanecem isolados por loja.

## Tecnologias

- .NET 10 LTS;
- WPF para a interface nativa Windows;
- ASP.NET Core para o serviço local;
- Entity Framework Core e SQLite;
- SignalR para atualização em tempo real;
- Inno Setup para os instaladores;
- GitHub Actions para CI, instaladores e releases.

## Estrutura

```text
src/
  Pdv.Domain/          Regras e entidades de negócio
  Pdv.Infrastructure/ Persistência SQLite e sincronização
  Pdv.StoreNode/       Serviço/API instalado na máquina principal
  Pdv.Desktop/         Interface do caixa e administração
tests/
  Pdv.Domain.Tests/
installer/
docs/
```

## Fluxo Git

- `main`: versões estáveis;
- `feature/*`: novas funcionalidades;
- `fix/*`: correções;
- `release/*`: preparação de versões;
- tags `vMAJOR.MINOR.PATCH`: publicação dos instaladores.

O workflow abre uma pull request para branches de trabalho. A CI compila, testa e gera os instaladores. Pull requests com a etiqueta `automerge` são integradas somente depois que a CI termina com sucesso.

## Estado da versão 0.1.0

Esta fundação já contém:

- serviço local com banco automático;
- isolamento por empresa e loja;
- produtos, estoque, vendas, compras e caixa no modelo;
- fila de sincronização por eventos;
- API de saúde, dashboard, produtos e vendas;
- interface minimalista com navegação por ícones;
- projetos de instalador Central e Terminal;
- pipelines de CI e release.

Os módulos comerciais ainda serão evoluídos em entregas incrementais.

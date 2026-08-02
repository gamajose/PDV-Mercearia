# ADR-001 — Stack Windows nativa

## Status

Aceito.

## Decisão

Usar .NET 10, WPF, ASP.NET Core, Entity Framework Core e SQLite.

## Motivos

- aplicação exclusivamente Windows;
- instalação self-contained;
- serviço local nativo;
- boa integração com impressoras, leitores e periféricos;
- baixo consumo comparado a um navegador completo embarcado;
- linguagem e runtime únicos para interface, serviço e domínio;
- suporte LTS;
- possibilidade de evolução para serviços centrais maiores.

## Consequências

- a interface não será executada em Linux ou macOS;
- o instalador precisará de privilégios administrativos no modo Central;
- o nó principal da loja deve permanecer ligado;
- comunicação entre lojas exige HTTPS ou uma VPN segura.

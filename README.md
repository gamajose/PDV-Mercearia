# PDV Gama

Sistema de ponto de venda desktop, sem emissão fiscal, voltado a pequenos e médios comércios.

O projeto será distribuído por instalador para Windows e terá banco de dados local, runtime Java e dependências incluídos. O usuário não precisará instalar Java, PostgreSQL ou qualquer outro componente separadamente.

## Objetivo

Atender diferentes segmentos por meio de perfis configuráveis, como mercearia, supermercado, hortifruti, açougue e comércio geral, mantendo uma única base de aplicação.

## Escopo inicial

- configuração da empresa e do segmento na primeira abertura;
- cadastro de produtos, categorias, clientes e fornecedores;
- controle de estoque e movimentações;
- compras e contas a pagar;
- vendas, caixa e formas de pagamento;
- emissão de comprovantes não fiscais de compra e venda;
- relatórios, backup e restauração;
- usuários, perfis e permissões;
- instalador autônomo para Windows.

> Este sistema não emitirá NF-e, NFC-e, SAT ou qualquer documento fiscal eletrônico. Os documentos gerados serão identificados claramente como comprovantes não fiscais.

## Arquitetura planejada

- Java 21 LTS;
- JavaFX 21 LTS;
- Maven;
- SQLite local;
- migrações automáticas de banco na inicialização;
- `jpackage` para gerar instalador Windows com runtime incorporado;
- GitHub Actions para gerar o instalador a cada versão publicada.

## Situação

Estrutura inicial em desenvolvimento.
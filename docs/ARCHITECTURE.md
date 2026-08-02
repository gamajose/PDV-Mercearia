# Arquitetura local-first

## Objetivos

1. A venda nunca deve depender da internet.
2. Um problema em uma filial não deve interromper outra.
3. O banco não deve ser aberto diretamente pelos terminais.
4. Estoque e caixa devem ser sempre escopados por loja.
5. A administração pode receber dados consolidados de todas as lojas.
6. A instalação deve incluir runtime e dependências.

## Componentes

### PDV Central

Instalado em uma máquina principal por loja.

- executa como serviço do Windows;
- mantém o SQLite local;
- expõe API apenas para a rede configurada;
- recebe operações dos terminais;
- controla consistência, estoque, caixa e numeração;
- registra eventos em uma outbox;
- sincroniza eventos com o hub administrador.

### PDV Terminal

Instalado nos caixas e computadores administrativos.

- não possui banco comercial próprio;
- comunica-se com o PDV Central da loja;
- mantém apenas configurações locais e cache visual;
- recebe atualizações em tempo real.

### Hub administrador

É o PDV Central designado como nó coordenador da empresa ou uma futura instalação dedicada.

- recebe eventos resumidos das filiais;
- mantém visão consolidada de vendas, compras e indicadores;
- não altera estoque de outra filial diretamente;
- não participa da finalização de vendas locais.

## Disponibilidade

- Rede local disponível e internet indisponível: loja opera normalmente.
- Máquina principal indisponível: terminais da loja ficam indisponíveis.
- Hub administrador indisponível: lojas continuam operando e acumulam eventos.
- Conexão restabelecida: eventos pendentes são reenviados de forma idempotente.

## Dados sincronizados

Sincronizados:

- resumo e itens de vendas;
- compras e despesas administrativas;
- indicadores de caixa;
- cadastros globais autorizados;
- auditoria e status dos nós.

Mantidos localmente por padrão:

- saldo operacional de estoque;
- sessão de caixa em andamento;
- configurações de impressora e periféricos;
- logs técnicos;
- credenciais locais.

## Segurança

- HTTPS ou VPN entre lojas;
- chave de pareamento por terminal;
- tokens curtos para sessão;
- senhas com hash;
- identificadores globais UUID;
- trilha de auditoria;
- nenhuma credencial versionada;
- API do nó limitada à rede configurada.

## Persistência

SQLite é usado exclusivamente pelo processo do nó local. WAL é habilitado para melhorar concorrência de leitura e escrita. Os terminais nunca acessam o arquivo do banco.

## Sincronização

O padrão é transactional outbox:

1. a operação comercial e o evento são gravados na mesma transação;
2. um worker lê eventos pendentes;
3. o hub confirma o recebimento pelo `EventId`;
4. reenvios são seguros e idempotentes;
5. o evento é marcado como sincronizado.

## Evolução

Quando o volume justificar, o hub administrador poderá migrar para PostgreSQL sem alterar o contrato entre terminais e nós locais.

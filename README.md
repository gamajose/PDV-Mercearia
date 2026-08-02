# PDV Gama

Sistema de ponto de venda desktop, sem emissão fiscal, voltado a pequenos e médios comércios.

O projeto é distribuído por instalador para Windows com banco de dados, runtime Java e dependências incluídos. O usuário não precisa instalar Java, PostgreSQL ou qualquer outro componente separadamente.

## Perfis de comércio

Na primeira abertura, o responsável escolhe o perfil da empresa. A mesma aplicação pode ser utilizada em:

- mercearia;
- supermercado;
- hortifruti;
- açougue;
- padaria;
- açaí e sorveteria;
- loja de conveniência;
- distribuidora;
- comércio geral.

A estrutura também aceita matriz e filiais. O estoque é separado por loja, permitindo evoluir posteriormente para vários caixas e sincronização entre unidades.

## Escopo funcional

- configuração da empresa e do segmento na primeira abertura;
- criação segura do primeiro usuário administrador;
- cadastro de produtos por unidade ou peso;
- categorias, clientes e fornecedores;
- estoque e movimentações separados por loja;
- compras e vendas;
- abertura e fechamento de caixa;
- dinheiro, PIX, débito, crédito, crediário e outras formas de pagamento;
- comprovantes não fiscais de compra e venda;
- base preparada para relatórios, backup e restauração;
- instalador autônomo para Windows.

> Este sistema não emite NF-e, NFC-e, SAT ou qualquer documento fiscal eletrônico. Todo documento gerado deve ser identificado claramente como **COMPROVANTE NÃO FISCAL**.

## Tecnologias

- Java 21 LTS;
- JavaFX 21 LTS;
- Maven;
- SQLite local;
- migrações automáticas de banco na inicialização;
- `jpackage` para gerar instalador Windows com runtime incorporado;
- GitHub Actions para validar o projeto e gerar o instalador.

## Executar durante o desenvolvimento

Pré-requisitos para desenvolvimento: JDK 21 e Maven.

```bash
mvn clean javafx:run
```

O banco é criado automaticamente em:

- Windows: `%LOCALAPPDATA%\PDVGama\pdv-gama.db`;
- Linux/macOS para desenvolvimento: `~/.pdv-gama/pdv-gama.db`.

Para utilizar outro diretório durante testes:

```bash
mvn javafx:run -Dpdv.data.dir=/caminho/temporario
```

## Compilar

```bash
mvn clean package
java -jar target/pdv-gama.jar
```

## Gerar o instalador no Windows

Com JDK 21, Maven e WiX Toolset instalados:

```powershell
mvn clean package
./packaging/build-installer.ps1 -AppVersion 0.1.0
```

O instalador será criado no diretório `dist`.

Também é possível executar manualmente o workflow **Build Windows Installer** no GitHub. Em versões publicadas com tags como `v0.1.0`, o instalador é gerado automaticamente.

## Situação atual

A fundação do MVP contém:

- assistente de configuração inicial;
- seleção do ramo de comércio;
- criação automática do banco e das tabelas;
- cadastro inicial do administrador com senha protegida;
- painel principal personalizado para a empresa;
- estrutura de dados dos módulos de produtos, estoque, clientes, fornecedores, compras, vendas, caixa, pagamentos e comprovantes;
- pipeline para geração do instalador `.exe`.

As próximas entregas transformarão os cartões do painel em módulos operacionais, começando por **Produtos e Estoque**, seguido por **Venda e Caixa**.

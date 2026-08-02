# PDV Gama

Sistema de ponto de venda local-first para pequenos comércios e redes com várias filiais.

O projeto possui dois modos de uso:

- **PDV Web na VM:** serviço Linux acessado pelo navegador, com banco SQLite, login e permissões;
- **PDV Windows:** Central e Terminal para operação local de caixa.

## Aplicação web na VM

A aplicação web não contém empresa, filial, usuário, produto ou venda de demonstração.

Em uma instalação nova, o fluxo é:

1. abrir o endereço da VM no navegador;
2. cadastrar a empresa real;
3. cadastrar a primeira filial;
4. criar o administrador;
5. entrar pela tela de login;
6. cadastrar outras filiais, usuários, permissões e produtos.

Todos os indicadores são calculados a partir do banco daquela instalação. Sem vendas ou produtos cadastrados, o painel apresenta valores zerados e estados vazios.

### Instalação em Linux

Requisitos da VM:

- Linux x86_64 com `systemd`;
- acesso à internet durante instalação e atualizações;
- `curl`, `python3`, `tar` e `sha256sum`;
- porta TCP 5080 liberada somente para as redes que usarão o sistema.

```bash
curl -fLO https://github.com/gamajose/PDV-Mercearia/releases/latest/download/PDV-Gama-install-web.sh
sudo bash PDV-Gama-install-web.sh
```

Depois da instalação:

```bash
systemctl status pdv-gama-web
systemctl status pdv-gama-update.timer
journalctl -u pdv-gama-web -f
```

Acesse pelo navegador:

```text
http://IP_DA_VM:5080
```

Diretórios usados:

```text
/opt/pdv-gama/             versões da aplicação
/var/lib/pdv-gama/         banco e dados persistentes
/etc/pdv-gama/             configuração do serviço
```

O banco fica fora da pasta dos executáveis. Uma atualização troca apenas a versão da aplicação e preserva os cadastros.

### Atualização automática

O instalador cria o timer `pdv-gama-update.timer`. A cada seis horas ele:

1. consulta a última GitHub Release;
2. compara com a versão instalada;
3. baixa o pacote Linux correto;
4. valida o SHA-256;
5. interrompe o serviço;
6. troca o link da versão de forma atômica;
7. inicia o serviço novamente.

Para verificar manualmente:

```bash
sudo /usr/local/sbin/pdv-gama-update
```

## Login e permissões

Não existe usuário ou senha padrão.

O primeiro administrador é criado no assistente inicial e recebe todas as permissões. Depois, ele pode criar usuários e liberar separadamente:

- painel;
- consulta e realização de vendas;
- consulta e gerenciamento de produtos;
- estoque;
- compras;
- relatórios;
- filiais;
- usuários e permissões;
- configurações.

Um usuário desativado não consegue entrar. A sessão usa cookie HTTP-only e SameSite estrito.

## Várias lojas

Cada filial possui estoque e operação próprios. Produtos pertencem à empresa, enquanto saldos de estoque são vinculados à filial.

A instalação na VM pode atuar como portal administrativo e serviço central. Para acesso entre locais diferentes, use VPN ou HTTPS por proxy reverso; não exponha a porta 5080 diretamente à internet sem proteção.

## Tecnologias

- .NET 10 LTS;
- ASP.NET Core para a aplicação web e APIs;
- HTML, CSS e JavaScript sem dependência de CDN;
- WPF para a interface nativa Windows;
- Entity Framework Core e SQLite;
- serviço `systemd` e timer de atualização no Linux;
- Inno Setup para os instaladores Windows;
- GitHub Actions para CI, pacotes e releases.

## Estrutura

```text
src/
  Pdv.Domain/          regras e entidades de negócio
  Pdv.Infrastructure/ persistência SQLite e sincronização
  Pdv.Web/            aplicação web instalada na VM
  Pdv.StoreNode/      serviço/API do PDV Central Windows
  Pdv.Desktop/        interface nativa Windows
deploy/linux/          instalação e atualização da VM
tests/                 testes automatizados
installer/             instaladores Windows
```

## Fluxo Git

- `main`: versões estáveis;
- `feature/*`: novas funcionalidades;
- `fix/*`: correções;
- `release/*`: preparação de versões;
- tags `vMAJOR.MINOR.PATCH`: publicação dos pacotes.

A CI compila e testa em Windows e Linux. A release inclui os instaladores Windows, o pacote web Linux, o checksum e o instalador da VM.

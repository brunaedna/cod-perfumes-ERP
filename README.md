# COD Perfumes ERP

Sistema web desenvolvido sob demanda para gestão de operações Cash on Delivery.

O projeto foi criado a partir da necessidade real de um cliente que trabalha com venda de perfumes por entrega. A operação exigia um controle mais preciso do que uma planilha comum conseguia oferecer, principalmente por envolver vendedores, entregadores, estoque em trânsito, pagamentos em dinheiro, comissões, vales e acertos financeiros.

O sistema acompanha a rotina completa da operação: entrada de estoque, lançamento da venda, controle do que cada entregador tem em mãos e fechamento financeiro com cada colaborador.

Atualmente, o ERP está sendo comercializado como uma solução personalizada para esse tipo de operação.

O sistema está em uso comercial. Por segurança, o link público da aplicação não é exibido neste repositório.

O principal diferencial é que ele não controla apenas vendas. Ele conecta vendas, estoque, entregadores e financeiro no mesmo fluxo.

Quando uma venda é cadastrada, o sistema identifica os produtos vendidos, calcula o total, registra vendedor e entregador, considera a forma de pagamento e faz a baixa automática do estoque.

Se houver pagamento em dinheiro, o valor entra automaticamente como vale para o entregador, porque na operação real esse dinheiro costuma ficar com ele até o momento do acerto.

Também existe controle de estoque com entregadores. É possível registrar quando produtos saem do estoque principal para um entregador, acompanhar o saldo em mãos, descontar automaticamente quando uma venda é feita e registrar devoluções quando o entregador retorna com produtos não vendidos.

A parte financeira foi construída para resolver um dos pontos mais sensíveis da operação: o acerto com colaboradores.

Cada vendedor ou entregador possui uma conta corrente dentro do ERP, onde ficam registradas comissões geradas, vales, pagamentos realizados, ajustes e saldo atual.

Isso permite saber rapidamente quanto a empresa ainda precisa pagar ou quanto precisa descontar de cada pessoa.

O sistema também calcula lucro operacional e lucro real. Além de considerar vendas, custos e comissões, ele permite registrar gastos com campanhas de tráfego pago, ajudando a entender o resultado real da operação em diferentes períodos.

Principais entregas:

- Controle completo de vendas Cash on Delivery
- Cadastro de vendas com múltiplos produtos
- Múltiplas formas de pagamento na mesma venda
- Registro de vendas entregues, pendentes e canceladas
- Taxa de entrega em vendas canceladas
- Comissão de vendedor e entregador
- Comissão adicional para vendedor ou entregador
- Comissão para venda própria do entregador
- Baixa automática de estoque
- Controle de estoque principal
- Controle de estoque em mãos dos entregadores
- Saída e devolução de produtos para entregadores
- Entrada de estoque manual
- Entrada de estoque por lista de fornecedor
- Reconhecimento aproximado de nomes de perfumes
- Criação automática de produto quando não existe no estoque
- Alertas de estoque mínimo
- Página de produtos mais vendidos
- Filtros por data, vendedor, entregador, produto e valor
- Conta corrente por colaborador
- Cálculo de saldo individual dos colaboradores
- Relatório de ganhos dos entregadores por período
- Controle de campanhas de tráfego pago
- Cálculo de lucro diário, últimos 30 dias e período personalizado
- Exportação de relatórios em Excel e TXT
- Backup local
- Sincronização em nuvem com Supabase
- Deploy em Cloudflare Pages
- Estrutura inicial para integração com WhatsApp Web

Tecnologias usadas:

- HTML
- CSS
- JavaScript
- Supabase
- Cloudflare Pages
- GitHub
- Manifest V3 para extensão de navegador

Estrutura do projeto:

```text
assets/
  css/
  js/

database/
docs/
extension/
src/

index.html
publish-cloudflare.ps1
_redirects

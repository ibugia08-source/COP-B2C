# Importação do ClickUp → COP B2C

## Como exportar do ClickUp

1. Abra a lista **TRÁFEGO PAGO** (espaço OPERAÇÃO) em visão de lista.
2. Menu `...` → **Export** → formato **CSV**, incluindo os campos custom (EMPRESA, ESTRATEGISTA, GESTOR 1, GESTOR 2, RESPONSÁVEL 1, MODELO DE NEGÓCIO, NICHO, STATUS DE SAÚDE, OBSERVAÇÃO, PRAZO e Tags).

## Como importar no COP

1. Acesse **Configurações → Importação** (`/configuracoes/importacao`) — exige permissão `settings.view` (prévia) e `settings.update`/OWNER (confirmação).
2. Selecione o CSV. O sistema mostra uma **prévia** com o que cada linha vira.
3. Revise: linhas verdes viram clientes; linhas âmbar são tarefas (não importadas aqui); linhas vermelhas têm problema.
4. Confirme. O relatório final mostra importados / ignorados / erros, e fica salvo no histórico.

Arquivo de exemplo: [`data/clickup-exemplo.csv`](../data/clickup-exemplo.csv).

## Mapeamento aplicado

| ClickUp | COP B2C |
|---|---|
| Card em `BASE DE CLIENTES` | Cliente `ATIVO`, etapa `BASE_DE_CLIENTES` |
| Card em `CLIENTES PERDIDOS` | Cliente `PERDIDO` + churn (motivo marcado para revisão) |
| Status de implantação (`CRIAÇÃO DE GRUPO`, `INTEGRAÇÃO META`, `INTEGRAÇÃO GOOGLE`, `PESQUISA DE MERCADO`, `DIAGNÓSTICO ESTRATÉGICO`, `ESTUDO DE FUNIL`, `INTEGRAÇÃO SOCIAL MEDIA`, `CRM`) | Cliente `IMPLANTACAO` + etapa equivalente do pipeline |
| `TAREFA DIÁRIA` / `TAREFAS SEMANAIS` / `TAREFAS SOCIAL MEDIA` / `PROJETOS ATIVOS` | **Não importadas como cliente** — recriar no módulo Tarefas (ou via templates) |
| Tag `ads ativo` / `ads pausado` | `adsStatus` |
| `STATUS DE SAÚDE` | `healthStatus` (ESTAVEL/OBSERVACAO/CRITICO) |
| `EMPRESA` contendo "Life" | `LIFE_ADS`; caso contrário `B2C_GESTAO` |
| `MODELO DE NEGÓCIO` | `ECOMMERCE` / `NEGOCIO_LOCAL` / `OUTROS` |
| `ESTRATEGISTA`, `GESTOR 1/2`, `RESPONSÁVEL 1` | Resolvidos por aproximação de nome contra os usuários cadastrados — **cadastre a equipe antes de importar** |
| `OBSERVAÇÃO` | `notes` |

## Reorganizar ANTES de importar

- Separe na lista o que é cliente do que é tarefa (o importador pula tarefas, mas revise).
- Padronize nichos (ex.: "Odonto" vs "Odontologia").
- Confirme quem são os clientes perdidos e o motivo real do churn (o importador marca um motivo genérico para revisão).
- **Credenciais**: não são importadas por CSV. Cadastre manualmente no Cofre de Acessos (criptografado) e depois apague os Docs de senhas do ClickUp.
- Briefings operacionais: copie para a aba Operação da ficha do cliente ou para Documentos (tipo BRIEFING).

## Regras de segurança da importação

- Duplicados por nome são ignorados (não sobrescreve).
- Cada importação gera um `ImportLog` com relatório completo.
- Nenhuma linha inválida derruba a importação — ela entra no relatório de erros.

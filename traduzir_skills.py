import os
import re

skills_dir = os.path.expanduser(r"~\.gemini\antigravity\skills")

translations = {
    "gsd-add-tests": "Gera testes para uma fase concluída com base nos critérios de UAT e na implementação",
    "gsd-ai-integration-phase": "Gera um contrato de design AI-SPEC.md para fases que envolvem a construção de sistemas de IA.",
    "gsd-audit-fix": "Pipeline autônomo de auditoria para correção — encontra problemas, classifica, corrige, testa e faz commit",
    "gsd-audit-milestone": "Audita a conclusão do marco em relação à intenção original antes do arquivamento",
    "gsd-audit-uat": "Auditoria em várias fases de todos os itens pendentes de UAT e verificação",
    "gsd-autonomous": "Executa todas as fases restantes de forma autônoma — discutir→planejar→executar por fase",
    "gsd-capture": "Captura ideias, tarefas, anotações e sementes para seu destino",
    "gsd-cleanup": "Arquiva os diretórios de fases acumulados dos marcos concluídos",
    "gsd-code-review": "Revisa os arquivos-fonte alterados durante uma fase em busca de bugs, problemas de segurança e qualidade de código",
    "gsd-complete-milestone": "Arquiva o marco concluído e prepara para a próxima versão",
    "gsd-config": "Configura as opções do GSD — alternadores de fluxo de trabalho, ajustes avançados, integrações e perfil de modelo",
    "gsd-debug": "Depuração sistemática com estado persistente através de redefinições de contexto",
    "gsd-discuss-phase": "Reúne o contexto da fase por meio de questionamentos adaptativos antes do planejamento.",
    "gsd-docs-update": "Gera ou atualiza a documentação do projeto verificada em relação ao código-fonte",
    "gsd-eval-review": "Audita a cobertura de avaliação de uma fase de IA executada e produz um plano de remediação EVAL-REVIEW.md.",
    "gsd-execute-phase": "Executa todos os planos em uma fase com paralelização baseada em ondas",
    "gsd-explore": "Ideação socrática e roteamento de ideias — pense nas ideias antes de se comprometer com os planos",
    "gsd-extract-learnings": "Extrai decisões, lições, padrões e surpresas dos artefatos das fases concluídas",
    "gsd-fast": "Executa uma tarefa trivial inline — sem subagentes, sem sobrecarga de planejamento",
    "gsd-forensics": "Investigação post-mortem para fluxos de trabalho GSD que falharam — diagnostica o que deu errado.",
    "gsd-graphify": "Constrói, consulta e inspeciona o grafo de conhecimento do projeto em .planning/graphs/",
    "gsd-health": "Diagnostica a saúde do diretório de planejamento e opcionalmente repara problemas",
    "gsd-help": "Exibe os comandos disponíveis do GSD e o guia de uso",
    "gsd-import": "Ingere planos externos com detecção de conflitos em relação às decisões do projeto antes de escrever algo.",
    "gsd-inbox": "Faz triagem e revisa issues e PRs abertos no GitHub de acordo com os modelos do projeto e diretrizes de contribuição.",
    "gsd-ingest-docs": "Inicializa ou mescla uma configuração .planning/ a partir de ADRs, PRDs, SPECs e documentos existentes em um repositório.",
    "gsd-manager": "Centro de comando interativo para gerenciar várias fases a partir de um terminal",
    "gsd-map-codebase": "Analisa o código-fonte com agentes mapeadores paralelos para produzir documentos em .planning/codebase/",
    "gsd-milestone-summary": "Gera um resumo abrangente do projeto a partir de artefatos do marco para integração da equipe e revisão",
    "gsd-new-milestone": "Inicia um novo ciclo de marco — atualiza PROJECT.md e direciona para os requisitos",
    "gsd-new-project": "Inicializa um novo projeto com coleta profunda de contexto e PROJECT.md",
    "gsd-ns-context": "inteligência do código-fonte | mapeamento, grafos, documentos, aprendizados",
    "gsd-ns-ideate": "captura de exploração | explorar, rascunhar, pesquisar, especificar, capturar",
    "gsd-ns-manage": "configuração do espaço de trabalho | fluxos de trabalho, threads, atualização, entrega, caixa de entrada",
    "gsd-ns-project": "ciclo de vida do projeto | marcos, auditorias, resumo",
    "gsd-ns-review": "portais de qualidade | revisão de código, depuração, auditoria, segurança, avaliação, interface",
    "gsd-ns-workflow": "fluxo de trabalho | discutir, planejar, executar, verificar progresso da fase",
    "gsd-pause-work": "Cria uma passagem de contexto ao pausar o trabalho no meio da fase",
    "gsd-phase": "CRUD para fases no ROADMAP.md — adicionar, inserir, remover ou editar fases",
    "gsd-plan-phase": "Cria um plano detalhado para a fase (PLAN.md) com ciclo de verificação",
    "gsd-plan-review-convergence": "Ciclo de convergência de plano multi-IA — replaneja com feedback da revisão até não restarem preocupações de nível ALTO.",
    "gsd-pr-branch": "Cria uma branch limpa para PR filtrando commits do diretório .planning/ — pronto para revisão de código",
    "gsd-profile-user": "Gera o perfil comportamental do desenvolvedor e cria artefatos detectáveis pelo Claude",
    "gsd-progress": "Verifica o progresso, avança o fluxo de trabalho ou despacha intenção livre — o comando situacional unificado do GSD",
    "gsd-quick": "Executa uma tarefa rápida com as garantias do GSD (commits atômicos, rastreamento de estado), mas pula os agentes opcionais",
    "gsd-resume-work": "Retoma o trabalho da sessão anterior com restauração completa do contexto",
    "gsd-review": "Solicita revisão por pares entre IAs para planos de fase de CLIs de IA externas",
    "gsd-review-backlog": "Revisa e promove itens do backlog para o marco ativo",
    "gsd-secure-phase": "Verifica retroativamente as mitigações de ameaças para uma fase concluída",
    "gsd-settings": "Configura alternadores de fluxo de trabalho do GSD e perfil do modelo",
    "gsd-ship": "Cria PR, executa revisão e prepara para merge após a aprovação da verificação",
    "gsd-sketch": "Esboça ideias de UI/design com maquetes HTML descartáveis ou propõe o que esboçar a seguir (modo fronteira)",
    "gsd-spec-phase": "Esclarece O QUE uma fase entrega com pontuação de ambiguidade; produz um SPEC.md antes da fase de discussão.",
    "gsd-spike": "Pesquisa uma ideia através da exploração experiencial ou propõe o que pesquisar a seguir (modo fronteira)",
    "gsd-stats": "Exibe estatísticas do projeto — fases, planos, requisitos, métricas do git e cronograma",
    "gsd-thread": "Gerencia threads de contexto persistentes para o trabalho em sessões cruzadas",
    "gsd-ui-phase": "Gera contrato de design de interface (UI-SPEC.md) para as fases de frontend",
    "gsd-ui-review": "Auditoria visual retroativa baseada em 6 pilares do código frontend implementado",
    "gsd-ultraplan-phase": "[BETA] Descarrega a fase de planejamento para a nuvem ultraplan do Claude Code; revisa no navegador e importa de volta.",
    "gsd-undo": "Reversão segura no git. Desfaz commits de fase ou plano usando o manifesto da fase com verificações de dependência.",
    "gsd-update": "Atualiza o GSD para a versão mais recente com exibição do registro de alterações (changelog)",
    "gsd-validate-phase": "Audita retroativamente e preenche lacunas de validação de Nyquist para uma fase concluída",
    "gsd-verify-work": "Valida recursos desenvolvidos através de UAT conversacional",
    "gsd-workspace": "Gerencia espaços de trabalho GSD — cria, lista ou remove ambientes isolados",
    "gsd-workstreams": "Gerencia fluxos de trabalho paralelos — lista, cria, alterna, verifica status, progride, conclui e retoma"
}

def translate_skills():
    if not os.path.exists(skills_dir):
        print(f"Diretório não encontrado: {skills_dir}")
        return

    count = 0
    for skill_folder in os.listdir(skills_dir):
        if not skill_folder.startswith("gsd-"):
            continue
            
        skill_path = os.path.join(skills_dir, skill_folder)
        if not os.path.isdir(skill_path):
            continue
            
        md_file = os.path.join(skill_path, "SKILL.md")
        if not os.path.exists(md_file):
            continue
            
        if skill_folder in translations:
            translated_desc = translations[skill_folder]
            
            with open(md_file, 'r', encoding='utf-8') as f:
                content = f.read()
                
            new_content = re.sub(
                r'^(description:\s*)(["\'].*?["\']|.*)$', 
                rf'\1"{translated_desc}"', 
                content, 
                flags=re.MULTILINE
            )
            
            if new_content != content:
                with open(md_file, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                count += 1
                print(f"Traduzido: {skill_folder}")
            else:
                print(f"Sem alterações (já traduzido ou não encontrado): {skill_folder}")
        else:
            print(f"Tradução não encontrada no dicionário para: {skill_folder}")

    print(f"Total de {count} arquivos SKILL.md atualizados com sucesso no diretório global (~/.gemini/antigravity/skills).")
    
    # Adicional: Também atualizar o repositório local do projeto, caso exista
    local_skills_dir = os.path.join(os.getcwd(), ".agent", "skills")
    if os.path.exists(local_skills_dir):
        local_count = 0
        for skill_folder in os.listdir(local_skills_dir):
            if not skill_folder.startswith("gsd-"):
                continue
            skill_path = os.path.join(local_skills_dir, skill_folder)
            if not os.path.isdir(skill_path):
                continue
            md_file = os.path.join(skill_path, "SKILL.md")
            if not os.path.exists(md_file):
                continue
            if skill_folder in translations:
                with open(md_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                new_content = re.sub(
                    r'^(description:\s*)(["\'].*?["\']|.*)$', 
                    rf'\1"{translations[skill_folder]}"', 
                    content, 
                    flags=re.MULTILINE
                )
                if new_content != content:
                    with open(md_file, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    local_count += 1
        print(f"Também atualizados {local_count} arquivos no diretório local do projeto (.agent/skills).")

if __name__ == "__main__":
    translate_skills()

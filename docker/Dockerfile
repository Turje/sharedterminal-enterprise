FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    vim \
    nano \
    build-essential \
    python3 \
    python3-pip \
    ca-certificates \
    tmux \
    jq \
    fzf \
    tig \
    htop \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user with explicit numeric UID/GID
RUN groupadd -g 1000 developer && \
    useradd -u 1000 -g 1000 -m -s /bin/bash developer

# Workspace directory
RUN mkdir -p /workspace && chown 1000:1000 /workspace

# Pre-create directories that need to exist in tmpfs home
RUN mkdir -p /etc/skel/.local/share /etc/skel/.cache /etc/skel/.config /etc/skel/.npm-global && \
    cp /etc/skel/.bashrc /etc/skel/.bashrc 2>/dev/null || true

# Configure npm to use user-writable global prefix
ENV NPM_CONFIG_PREFIX=/home/developer/.npm-global
ENV PATH="/home/developer/.npm-global/bin:${PATH}"

# Add AI CLI helper to bashrc — catches common AI commands with a helpful message
RUN cat >> /etc/skel/.bashrc <<'AIHELPER'

# npm global path for non-root installs
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
export PATH="$HOME/.npm-global/bin:$PATH"

# SharedTerminal: helpful message when AI CLI tools aren't installed
_st_ai_hint() {
  echo -e "\e[1;34m[SharedTerminal]\e[0m $1 is not pre-installed (saves ~200MB)."
  echo -e "\e[1;33mOption 1:\e[0m Use the \e[1;32mAI Assistant\e[0m panel in the sidebar — it has full terminal context."
  echo -e "\e[1;33mOption 2:\e[0m Install it yourself:  \e[1;36m$2\e[0m"
}
command -v claude >/dev/null 2>&1 || claude() { _st_ai_hint "Claude Code" "npm install -g @anthropic-ai/claude-code && claude"; }
command -v aider >/dev/null 2>&1 || aider() { _st_ai_hint "Aider" "pip install aider-chat && aider"; }
command -v copilot >/dev/null 2>&1 || copilot() { _st_ai_hint "GitHub Copilot CLI" "npm install -g @githubnext/github-copilot-cli && copilot"; }

# clear keeps MOTD, clearall removes everything
alias clear='command clear && cat /etc/sharedterminal-motd 2>/dev/null'
alias clearall='command clear'
AIHELPER

# Static MOTD displayed on clear (dynamic version sent by server on connect)
RUN printf '\n\033[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n  \033[1m\033[38;5;173mSharedTerminal\033[0m \033[2m— Cross-Stack Incident Sandbox\033[0m \033[32m🛡\033[0m\n\033[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n\n  \033[36m►\033[0m \033[1mnpm start\033[0m           Run the API \033[2m(watch for redacted keys)\033[0m\n  \033[36m►\033[0m \033[1mpython3 model.py\033[0m    Run inference \033[2m(hits OOM on batch 3)\033[0m\n  \033[36m►\033[0m \033[1mcat .env\033[0m            Test DLP \033[2m(secrets auto-masked)\033[0m\n  \033[36m►\033[0m \033[1mcurl :3001/crash\033[0m    Hit 5x to trigger the crash\n\n  \033[1mCollaborate\033[0m  Share this URL — teammates join instantly\n  \033[1mCompliance\033[0m   Tamper-evident audit log & DLP active\n  \033[1mAI Tools\033[0m     Install any AI CLI — the sidebar connects automatically\n\n\033[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n\n' > /etc/sharedterminal-motd

# Bake demo workspace into image (seeded into /workspace by entrypoint)
COPY demo-workspace/package*.json /opt/demo-workspace/
RUN cd /opt/demo-workspace && npm install --omit=dev 2>/dev/null || true
COPY demo-workspace/ /opt/demo-workspace/

# Entrypoint script that copies skeleton files to tmpfs home + seeds workspace
RUN printf '#!/bin/bash\nif [ ! -f /home/developer/.bashrc ]; then\n  cp -r /etc/skel/. /home/developer/ 2>/dev/null || true\n  chown -R 1000:1000 /home/developer 2>/dev/null || true\nfi\n# Seed workspace from demo template if empty\nif [ -d /opt/demo-workspace ] && [ -z "$(ls -A /workspace 2>/dev/null)" ]; then\n  cp -r /opt/demo-workspace/. /workspace/ 2>/dev/null || true\nfi\nexec "$@"\n' > /usr/local/bin/entrypoint.sh && \
    chmod +x /usr/local/bin/entrypoint.sh

USER 1000:1000
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/bin/bash"]

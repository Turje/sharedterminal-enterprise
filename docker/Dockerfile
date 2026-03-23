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
RUN mkdir -p /etc/skel/.local/share /etc/skel/.cache /etc/skel/.config && \
    cp /etc/skel/.bashrc /etc/skel/.bashrc 2>/dev/null || true

# Entrypoint script that copies skeleton files to tmpfs home
RUN printf '#!/bin/bash\nif [ ! -f /home/developer/.bashrc ]; then\n  cp -r /etc/skel/. /home/developer/ 2>/dev/null || true\n  chown -R 1000:1000 /home/developer 2>/dev/null || true\nfi\nexec "$@"\n' > /usr/local/bin/entrypoint.sh && \
    chmod +x /usr/local/bin/entrypoint.sh

USER 1000:1000
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/bin/bash"]

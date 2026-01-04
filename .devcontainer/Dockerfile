FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Install just, ffmpeg, and other utilities
RUN apt-get update && apt-get install -y \ 
    git \ 
    ffmpeg \ 
    zip \ 
    unzip \ 
    build-essential \ 
    python3 \ 
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin

# Install pnpm
RUN npm install -g pnpm

# Ensure we are in the expected directory (VS Code mounts the repo here usually)
WORKDIR /workspaces/spacecake/spacecake-app

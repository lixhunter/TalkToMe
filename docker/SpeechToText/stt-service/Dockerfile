# Build whisper.cpp mit Vulkan-Backend (AMD-GPU via Mesa RADV)
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Build-Deps + Runtime: Vulkan loader, RADV-Treiber (AMD), glslc (Shader-Compiler), ffmpeg, python
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git ca-certificates \
    libvulkan-dev vulkan-tools mesa-vulkan-drivers glslc \
    ffmpeg python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# whisper.cpp bauen mit Vulkan
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp /opt/whisper.cpp \
    && cmake -S /opt/whisper.cpp -B /opt/whisper.cpp/build -DGGML_VULKAN=1 -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /opt/whisper.cpp/build --config Release -j --target whisper-cli

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY main.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8001
ENTRYPOINT ["./entrypoint.sh"]

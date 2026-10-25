FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY a2f_controller.py /app/

EXPOSE 8283

CMD ["python", "a2f_controller.py"]

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt
COPY main.py .
RUN useradd --system --uid 10001 app && mkdir /data && chown app /data
ENV DB_PATH=/data/app.db PYTHONDONTWRITEBYTECODE=1
USER app
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]

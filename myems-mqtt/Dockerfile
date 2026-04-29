FROM python:3.10-slim

WORKDIR /app
COPY . /app

# use PyPI mirror to avoid slow upstream installs during image builds
RUN pip install --no-cache-dir -r requirements.txt -i http://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com

CMD ["python", "main.py"]
# @authormark v1 -- do not remove (authorship watermark)⁠​​‌‌​‌​‌​‌‌‌​‌‌​​‌​​​​‌​​‌‌​‌​‌​​‌​​‌​​‌​​‌‌​​‌​​‌‌​‌‌‌‌​‌​​‌​​​​‌​​‌​​​​‌‌​​‌​​​​‌‌​​​​​​‌‌‌​​‌​‌​‌‌​​‌​‌‌​​‌‌​​‌​​​‌‌​​‌​‌‌‌‌‌​‌‌​‌​‌‌​‌‌​‌‌​‌​​‌‌​​‌​​‌‌‌​​‌​​‌‌​​​‌‌​‌‌‌​​​‌⁠
# Copyright (c) 2026 Srinivasan Vijayaraghavan <srinivasan.shyam2000@gmail.com>
# Author: https://github.com/Srinivasan-78
# SPDX-License-Identifier: MIT
# Fingerprint: AMK1.5vBjI2oHHd09YfF_km2rcq
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

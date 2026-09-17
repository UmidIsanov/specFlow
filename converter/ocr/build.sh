#!/usr/bin/env bash
# Сборка локального распознавателя (только macOS: движок Vision).
cd "$(dirname "$0")" && swiftc -O -o ocr ocr.swift && echo "ocr собран: $(pwd)/ocr"

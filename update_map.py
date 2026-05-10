"""
Скрипт для автоматического обновления данных карты с Game8
Запускается через GitHub Actions
"""

import re
import json
import hashlib
import time
from html import unescape
from pathlib import Path

try:
    import cloudscraper
    USE_CLOUDSCRAPER = True
except ImportError:
    import requests
    USE_CLOUDSCRAPER = False


# Заголовки для имитации браузера
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def extract_map_props(html):
    """Извлечь JSON-объект data-react-props из HTML страницы."""
    tag_match = re.search(
        r"<div\b[^>]*\bid=['\"]react-new_map_tool-wrapper['\"][^>]*>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    candidates = []

    if tag_match:
        tag = tag_match.group(0)
        attr_match = re.search(
            r"\bdata-react-props=(['\"])(.*?)\1",
            tag,
            flags=re.DOTALL,
        )
        if attr_match:
            candidates.append(attr_match.group(2))

    for attr_match in re.finditer(
        r"\bdata-react-props=(['\"])(.*?)\1",
        html,
        flags=re.DOTALL,
    ):
        candidates.append(attr_match.group(2))

    for props_str in candidates:
        props_str = unescape(props_str)
        try:
            return json.loads(props_str)
        except json.JSONDecodeError:
            continue

    return None


def create_session():
    """Создать сессию с обходом Cloudflare"""
    if USE_CLOUDSCRAPER:
        print("Используем cloudscraper для обхода защиты")
        return cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'desktop': True
            }
        )
    else:
        print("cloudscraper не установлен, используем requests")
        return requests.Session()


def get_map_json_url(session):
    """Получить URL JSON файла карты со страницы Game8"""
    page_url = "https://game8.co/games/Arknights-Endfield/archives/533176"

    last_error = None

    for attempt in range(1, 4):
        print(f"Загрузка страницы: {page_url} (попытка {attempt}/3)")
        response = session.get(page_url, headers=HEADERS, timeout=30)
        response.raise_for_status()

        html = response.text
        props = extract_map_props(html)

        if props:
            mapping_id = props.get("toolStructuralMappingId")
            tool_mapping = props.get("toolStructuralMapping", {})
            updated_at = tool_mapping.get("updatedAt")

            if mapping_id:
                break

            last_error = ValueError("Не удалось извлечь toolStructuralMappingId")
        else:
            last_error = ValueError("Не удалось найти data-react-props на странице")

        if attempt < 3:
            print("↻ Не удалось разобрать страницу, повторяю запрос...")
            time.sleep(2)
    else:
        raise last_error
    
    # Формируем URL
    json_url = f"https://game8.co/api/tool_structural_mappings/{mapping_id}.json"
    if updated_at:
        json_url += f"?updatedAt={updated_at}"
    
    print(f"Mapping ID: {mapping_id}")
    print(f"Updated At: {updated_at}")
    print(f"JSON URL: {json_url}")
    
    return json_url


def download_map_data(session, url):
    """Скачать JSON данные карты"""
    print(f"Скачивание данных карты...")
    
    # Заголовки для API запроса
    api_headers = HEADERS.copy()
    api_headers["Accept"] = "application/json, text/plain, */*"
    api_headers["Referer"] = "https://game8.co/games/Arknights-Endfield/archives/533176"
    
    response = session.get(url, headers=api_headers, timeout=60)
    response.raise_for_status()
    
    data = response.json()
    print(f"Данные успешно загружены")
    return data


def get_content_hash(data):
    """Получить хеш содержимого для сравнения (исключая изменяемые поля)"""
    # Копируем данные для модификации
    data_copy = json.loads(json.dumps(data))
    
    # Удаляем поля, которые могут меняться без реальных изменений данных
    if "coordinateArraySchema" in data_copy:
        schema = data_copy["coordinateArraySchema"]
        if "relationalDamreyDbSchema" in schema:
            schema["relationalDamreyDbSchema"].pop("updatedAt", None)
    
    content = json.dumps(data_copy, sort_keys=True)
    return hashlib.md5(content.encode()).hexdigest()


def main():
    map_file = Path("map.json")
    
    # Создаём сессию с обходом защиты
    session = create_session()
    
    # Получаем URL JSON
    json_url = get_map_json_url(session)
    
    # Скачиваем новые данные
    new_data = download_map_data(session, json_url)
    
    # Проверяем, есть ли изменения
    if map_file.exists():
        with open(map_file, "r", encoding="utf-8") as f:
            old_data = json.load(f)
        
        old_hash = get_content_hash(old_data)
        new_hash = get_content_hash(new_data)
        
        if old_hash == new_hash:
            print("✓ Данные карты не изменились")
            return False
        
        print(f"Обнаружены изменения в данных карты")
    else:
        print("Файл map.json не существует, создаём новый")
    
    # Сохраняем новые данные
    with open(map_file, "w", encoding="utf-8") as f:
        json.dump(new_data, f, ensure_ascii=False, indent="\t")
    
    print(f"✓ Файл map.json успешно обновлён")
    return True


if __name__ == "__main__":
    try:
        changed = main()
        exit(0 if changed else 0)
    except Exception as e:
        print(f"✗ Ошибка: {e}")
        exit(1)

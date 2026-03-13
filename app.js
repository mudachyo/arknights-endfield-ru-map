/**
 * ============================================
 * ARKNIGHTS ENDFIELD - INTERACTIVE MAP
 * Main Application JavaScript
 * ============================================
 * 
 * Архитектура:
 * - MapController: управление Leaflet картой
 * - DataManager: парсинг и фильтрация данных
 * - StorageManager: работа с LocalStorage
 * - UIController: управление интерфейсом
 */

// ============================================
// КОНСТАНТЫ И КОНФИГУРАЦИЯ
// ============================================
const CONFIG = {
    STORAGE_KEY: 'arknights_endfield_collected',
    STORAGE_VISIBILITY_KEY: 'arknights_endfield_visibility',
    // Размер карты - координаты до ~230, ставим 256 для запаса
    MAP_SIZE: 256,
    MAP_OPTIONS: {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 6,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 120,
        attributionControl: false
    },
    MARKER_SIZE: 32,
    DEFAULT_ICON_URL: 'https://img.game8.co/4383512/06b2c71bebe6a5ecce17a8e22c385bf9.png/show'
};

// ============================================
// LIGHTBOX - Просмотр изображений
// ============================================

/**
 * Открыть изображение в lightbox
 * @param {string} url - URL изображения
 */
function openLightbox(url) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = lightbox.querySelector('.lightbox-image');
    
    if (lightbox && lightboxImage && url) {
        lightboxImage.src = url;
        lightbox.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Закрыть lightbox
 */
function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Инициализация обработчиков lightbox при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        // Закрытие по клику на overlay
        const overlay = lightbox.querySelector('.lightbox-overlay');
        if (overlay) {
            overlay.addEventListener('click', closeLightbox);
        }
        
        // Закрытие по кнопке
        const closeBtn = lightbox.querySelector('.lightbox-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeLightbox);
        }
        
        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
                closeLightbox();
            }
        });
    }
});

// Глобальная ссылка на приложение для обработчиков в popup
let appInstance = null;

/**
 * Глобальная функция для отметки предмета собранным (вызывается из popup)
 * @param {string} id - ID предмета
 */
function markCollected(id) {
    if (appInstance) {
        appInstance.toggleCollected(id);
        appInstance.mapController.map.closePopup();
    }
}

// ============================================
// СЛОВАРЬ ПЕРЕВОДОВ
// ============================================
const TRANSLATIONS = {
    // Названия предметов (title / classification)
    items: {
        'Chest': 'Ящик',
        'Aurylene': 'Аурилен',
        'Facility Repair Robot': 'Дельта-бот',
        'Protocol Datalogger': 'Протокольный регистратор',
        'Ferrium Ore': 'Феррий',
        'Recycling Station': 'Станция переработки',
        'Originium Ore': 'Ориджиний',
        'Gear Template Crate': 'Ящик снаряжения',
        'Pink Bolete': 'Розовый гриб',
        'Kalkonyx': 'Кальценикс',
        'Kalkodendra': 'Калкодендра',
        'Repair Logic': 'Ремонтная схема',
        'Amethyst Ore': 'Аметист',
        'Auronyx': 'Ауроникс',
        'Chrysodendra': 'Хризодендра',
        'Umbronyx': 'Умброникс',
        'Ruby Bolete': 'Рубиновый гриб',
        'Red Bolete': 'Красный гриб',
        'Vitrodendra': 'Витродендра',
        // Классификации
        'Mining': 'Добыча руды',
        'Rare Growths': 'Редкие растения',
        'Rare Ores': 'Редкие руды'
    },
    // Названия регионов
    regions: {
        'Valley IV': 'Долина IV',
        'Wuling': 'Улин'
    },
    // Названия областей (часть после двоеточия)
    areas: {
        'The Hub': 'Центр',
        'Valley Pass': 'Перевал',
        'Aburrey Quarry': 'Карьер Эберрей',
        'Originium Science Park': 'Центр исследования ориджиния',
        'Origin Lodespring': 'Первое месторождение',
        'Power Plateau': 'Плато Энергии',
        'Jingyu Valley': 'Долина Цзинъю',
        'Wuling City': 'Город Улин',
        'Qingbo Stockade': 'Лагерь Циньбо'
    }
};

/**
 * Перевести название предмета
 */
function translateItem(name) {
    return TRANSLATIONS.items[name] || name;
}

/**
 * Перевести название региона
 */
function translateRegion(name) {
    return TRANSLATIONS.regions[name] || name;
}

/**
 * Перевести название области
 */
function translateArea(name) {
    return TRANSLATIONS.areas[name] || name;
}

// ============================================
// STORAGE MANAGER - Работа с LocalStorage
// ============================================
class StorageManager {
    constructor() {
        this.collectedKey = CONFIG.STORAGE_KEY;
        this.visibilityKey = CONFIG.STORAGE_VISIBILITY_KEY;
    }

    /**
     * Получить все собранные предметы
     * @returns {Set<string>} Множество ID собранных предметов
     */
    getCollected() {
        try {
            const data = localStorage.getItem(this.collectedKey);
            return new Set(data ? JSON.parse(data) : []);
        } catch (e) {
            console.error('Ошибка чтения LocalStorage:', e);
            return new Set();
        }
    }

    /**
     * Сохранить состояние собранного предмета
     * @param {string} id - ID предмета
     * @param {boolean} collected - Собран ли предмет
     */
    setCollected(id, collected) {
        const items = this.getCollected();
        if (collected) {
            items.add(id);
        } else {
            items.delete(id);
        }
        try {
            localStorage.setItem(this.collectedKey, JSON.stringify([...items]));
        } catch (e) {
            console.error('Ошибка записи в LocalStorage:', e);
        }
    }

    /**
     * Проверить, собран ли предмет
     * @param {string} id - ID предмета
     * @returns {boolean}
     */
    isCollected(id) {
        return this.getCollected().has(id);
    }

    /**
     * Сбросить прогресс для конкретной области
     * @param {Array<string>} ids - Массив ID предметов области
     */
    resetAreaProgress(ids) {
        const items = this.getCollected();
        ids.forEach(id => items.delete(id));
        try {
            localStorage.setItem(this.collectedKey, JSON.stringify([...items]));
        } catch (e) {
            console.error('Ошибка записи в LocalStorage:', e);
        }
    }

    /**
     * Получить настройки видимости маркеров
     * @param {string} areaKey - Ключ области
     * @returns {Object} Объект с настройками видимости
     */
    getVisibility(areaKey) {
        try {
            const data = localStorage.getItem(this.visibilityKey);
            const visibility = data ? JSON.parse(data) : {};
            return visibility[areaKey] || {};
        } catch (e) {
            console.error('Ошибка чтения настроек видимости:', e);
            return {};
        }
    }

    /**
     * Сохранить настройки видимости
     * @param {string} areaKey - Ключ области
     * @param {Object} settings - Настройки видимости
     */
    setVisibility(areaKey, settings) {
        try {
            const data = localStorage.getItem(this.visibilityKey);
            const visibility = data ? JSON.parse(data) : {};
            visibility[areaKey] = settings;
            localStorage.setItem(this.visibilityKey, JSON.stringify(visibility));
        } catch (e) {
            console.error('Ошибка записи настроек видимости:', e);
        }
    }

    /**
     * Экспортировать все данные в JSON
     * @returns {Object} Объект с данными для бэкапа
     */
    exportBackup() {
        try {
            const collected = localStorage.getItem(this.collectedKey);
            const visibility = localStorage.getItem(this.visibilityKey);
            return {
                version: 1,
                exportDate: new Date().toISOString(),
                collected: collected ? JSON.parse(collected) : [],
                visibility: visibility ? JSON.parse(visibility) : {}
            };
        } catch (e) {
            console.error('Ошибка экспорта данных:', e);
            return null;
        }
    }

    /**
     * Импортировать данные из бэкапа
     * @param {Object} backup - Объект с данными бэкапа
     * @returns {boolean} Успешность импорта
     */
    importBackup(backup) {
        try {
            if (!backup || typeof backup !== 'object') {
                throw new Error('Неверный формат бэкапа');
            }

            // Импорт собранных предметов
            if (Array.isArray(backup.collected)) {
                localStorage.setItem(this.collectedKey, JSON.stringify(backup.collected));
            }

            // Импорт настроек видимости
            if (backup.visibility && typeof backup.visibility === 'object') {
                localStorage.setItem(this.visibilityKey, JSON.stringify(backup.visibility));
            }

            return true;
        } catch (e) {
            console.error('Ошибка импорта данных:', e);
            return false;
        }
    }
}

// ============================================
// DATA MANAGER - Парсинг и управление данными
// ============================================
class DataManager {
    constructor() {
        this.rawData = null;
        this.areas = [];
        this.coordinates = [];
        this.regions = new Map(); // region -> Set of areas
        this.areaToUrl = new Map(); // area title -> image url
    }

    /**
     * Загрузить и распарсить JSON данные
     * @param {string} url - URL JSON файла
     */
    async loadData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.rawData = await response.json();
            this.parseData();
            return true;
        } catch (e) {
            console.error('Ошибка загрузки данных:', e);
            return false;
        }
    }

    /**
     * Распарсить данные JSON
     */
    parseData() {
        // Парсинг областей
        this.areas = this.rawData.areas || [];
        this.areas.forEach(area => {
            this.areaToUrl.set(area.title, area.url);
            
            // Извлекаем регион из названия области (формат: "Region:Area")
            const [region] = area.title.split(':');
            if (!this.regions.has(region)) {
                this.regions.set(region, new Set());
            }
            this.regions.get(region).add(area.title);
        });

        // Парсинг координат предметов
        this.coordinates = this.rawData.coordinateArraySchema?.coordinates || [];
    }

    /**
     * Получить список регионов
     * @returns {Array<string>}
     */
    getRegions() {
        return [...this.regions.keys()];
    }

    /**
     * Получить области региона
     * @param {string} region - Название региона
     * @returns {Array<string>}
     */
    getAreasForRegion(region) {
        const areas = this.regions.get(region);
        return areas ? [...areas] : [];
    }

    /**
     * Получить URL изображения области
     * @param {string} areaTitle - Полное название области
     * @returns {string|null}
     */
    getAreaImageUrl(areaTitle) {
        return this.areaToUrl.get(areaTitle) || null;
    }

    /**
     * Получить предметы для конкретной области
     * @param {string} areaTitle - Полное название области
     * @returns {Array<Object>}
     */
    getItemsForArea(areaTitle) {
        return this.coordinates.filter(item => item.area === areaTitle);
    }

    /**
     * Получить уникальные классификации для области
     * @param {string} areaTitle - Полное название области
     * @param {StorageManager} storage - Менеджер хранилища для подсчёта собранных
     * @returns {Array<Object>} - Массив объектов с классификацией, количеством и собранными
     */
    getClassificationsForArea(areaTitle, storage) {
        const items = this.getItemsForArea(areaTitle);
        const classifications = new Map();
        
        items.forEach(item => {
            // Используем title вместо classification для индивидуальных типов
            const cls = item.title || 'Unknown';
            if (!classifications.has(cls)) {
                classifications.set(cls, {
                    name: cls,
                    count: 0,
                    collected: 0,
                    icon: item.pinIcon || CONFIG.DEFAULT_ICON_URL,
                    items: []
                });
            }
            const classData = classifications.get(cls);
            classData.count++;
            classData.items.push(item.id);
            if (storage && storage.isCollected(item.id)) {
                classData.collected++;
            }
        });
        
        // Сортировка по количеству (по убыванию), при равенстве — по имени
        return [...classifications.values()].sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.name.localeCompare(b.name);
        });
    }

    /**
     * Получить все URL изображений областей
     * @returns {Array<string>}
     */
    getAllAreaImageUrls() {
        return [...this.areaToUrl.values()];
    }

    /**
     * Парсинг координат из строки
     * Координаты в JSON уже в нужном формате, не требуют преобразования
     * @param {string} coordString - Строка формата "X,Y"
     * @returns {Object} - {x, y}
     */
    static parseCoordinate(coordString) {
        const [x, y] = coordString.split(',').map(parseFloat);
        return { 
            x: x || 0, 
            y: y || 0 
        };
    }
}

// ============================================
// MAP CONTROLLER - Управление Leaflet картой
// ============================================
class MapController {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.imageOverlay = null;
        this.markers = new Map(); // id -> marker
        this.markerLayers = new Map(); // classification -> LayerGroup
        this.currentBounds = null;
    }

    /**
     * Инициализация карты
     */
    initialize() {
        // Очистка предыдущей карты
        if (this.map) {
            this.map.remove();
        }
        
        const container = document.getElementById(this.containerId);
        container.innerHTML = '';
        
        this.map = L.map(this.containerId, CONFIG.MAP_OPTIONS);
        this.markers.clear();
        this.markerLayers.clear();
    }

    /**
     * Загрузить изображение карты
     * @param {string} imageUrl - URL изображения
     */
    async loadMapImage(imageUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // Не используем crossOrigin для внешних изображений
            
            img.onload = () => {
                const width = img.naturalWidth;
                const height = img.naturalHeight;
                
                // Сохраняем реальные размеры изображения
                this.imageWidth = width;
                this.imageHeight = height;
                
                // Используем фиксированный размер координат 256x256
                // Это покрывает все координаты в JSON (максимум ~230)
                const mapSize = CONFIG.MAP_SIZE;
                // Leaflet bounds: [[minLat, minLng], [maxLat, maxLng]]
                // Для CRS.Simple это [[minY, minX], [maxY, maxX]]
                this.currentBounds = [[0, 0], [mapSize, mapSize]];
                
                // Удаляем старый оверлей
                if (this.imageOverlay) {
                    this.imageOverlay.remove();
                }
                
                // Добавляем изображение как оверлей
                this.imageOverlay = L.imageOverlay(imageUrl, this.currentBounds).addTo(this.map);
                
                // Устанавливаем границы с небольшим запасом
                const padding = 50;
                this.map.setMaxBounds([[-padding, -padding], [mapSize + padding, mapSize + padding]]);
                this.map.fitBounds(this.currentBounds);
                
                console.log(`Карта загружена: ${width}x${height}, bounds: [[0,0], [${mapSize}, ${mapSize}]]`);
                
                resolve({ width, height });
            };
            
            img.onerror = (e) => {
                console.error('Ошибка загрузки изображения:', e);
                // Пробуем загрузить напрямую через Leaflet без предзагрузки
                this.loadMapImageDirect(imageUrl, resolve, reject);
            };
            
            img.src = imageUrl;
        });
    }

    /**
     * Прямая загрузка изображения через Leaflet (fallback)
     */
    loadMapImageDirect(imageUrl, resolve, reject) {
        const mapSize = CONFIG.MAP_SIZE;
        this.currentBounds = [[0, 0], [mapSize, mapSize]];
        this.imageWidth = 1920;
        this.imageHeight = 1080;
        
        if (this.imageOverlay) {
            this.imageOverlay.remove();
        }
        
        try {
            this.imageOverlay = L.imageOverlay(imageUrl, this.currentBounds).addTo(this.map);
            const half = mapSize / 2;
            this.map.setMaxBounds([[-half, -half], [mapSize + half, mapSize + half]]);
            this.map.fitBounds(this.currentBounds);
            resolve({ width: this.imageWidth, height: this.imageHeight });
        } catch (e) {
            reject(new Error('Не удалось загрузить изображение карты'));
        }
    }

    /**
     * Добавить маркеры на карту
     * @param {Array<Object>} items - Массив предметов
     * @param {StorageManager} storage - Менеджер хранилища
     * @param {Function} onMarkerClick - Колбэк клика по маркеру
     */
    addMarkers(items, storage, onMarkerClick) {
        // Очищаем предыдущие маркеры
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this.markerLayers.forEach(layer => layer.clearLayers());
        this.markerLayers.clear();

        items.forEach((item, index) => {
            const coord = DataManager.parseCoordinate(item.coordinate);
            const isCollected = storage.isCollected(item.id);
            
            // Создаём кастомную иконку
            const icon = this.createMarkerIcon(item.pinIcon, isCollected);
            
            // Leaflet CRS.Simple: [lat, lng]
            // Пробуем: JSON X -> Leaflet lat, JSON Y -> Leaflet lng (без инверсии)
            const leafletLat = coord.x;
            const leafletLng = coord.y;
            
            // Отладка первых 3 маркеров
            if (index < 3) {
                console.log(`Маркер "${item.title}": JSON(${item.coordinate}) -> Leaflet[${leafletLat}, ${leafletLng}]`);
            }
            
            // Создаём маркер
            const marker = L.marker([leafletLat, leafletLng], { 
                icon,
                riseOnHover: true
            });
            
            // Сохраняем данные в маркере
            marker.itemData = item;
            marker.isCollected = isCollected;
            
            // Обработчик клика
            marker.on('click', () => onMarkerClick(item, marker));
            
            // Добавляем в соответствующий слой по title (индивидуальный тип)
            const layerKey = item.title || 'Unknown';
            if (!this.markerLayers.has(layerKey)) {
                this.markerLayers.set(layerKey, L.layerGroup().addTo(this.map));
            }
            this.markerLayers.get(layerKey).addLayer(marker);
            
            // Сохраняем маркер
            this.markers.set(item.id, marker);
        });
    }

    /**
     * Создать иконку маркера
     * @param {string} iconUrl - URL иконки
     * @param {boolean} isCollected - Собран ли предмет
     * @returns {L.DivIcon}
     */
    createMarkerIcon(iconUrl, isCollected) {
        const collectedClass = isCollected ? 'collected' : '';
        return L.divIcon({
            className: `custom-marker ${collectedClass}`,
            html: `<img src="${iconUrl || CONFIG.DEFAULT_ICON_URL}" alt="marker" onerror="this.src='${CONFIG.DEFAULT_ICON_URL}'">`,
            iconSize: [CONFIG.MARKER_SIZE, CONFIG.MARKER_SIZE],
            iconAnchor: [CONFIG.MARKER_SIZE / 2, CONFIG.MARKER_SIZE / 2],
            popupAnchor: [0, -CONFIG.MARKER_SIZE / 2]
        });
    }

    /**
     * Обновить иконку маркера
     * @param {string} id - ID предмета
     * @param {boolean} isCollected - Собран ли предмет
     */
    updateMarkerIcon(id, isCollected) {
        const marker = this.markers.get(id);
        if (marker) {
            marker.isCollected = isCollected;
            const newIcon = this.createMarkerIcon(marker.itemData.pinIcon, isCollected);
            marker.setIcon(newIcon);
        }
    }

    /**
     * Переключить видимость слоя классификации
     * @param {string} classification - Название классификации
     * @param {boolean} visible - Видимость
     */
    toggleClassificationLayer(classification, visible) {
        const layer = this.markerLayers.get(classification);
        if (layer) {
            if (visible) {
                this.map.addLayer(layer);
            } else {
                this.map.removeLayer(layer);
            }
        }
    }

    /**
     * Переключить видимость конкретного маркера
     * @param {string} id - ID предмета
     * @param {boolean} visible - Видимость
     */
    toggleMarker(id, visible) {
        const marker = this.markers.get(id);
        if (marker) {
            const layer = this.markerLayers.get(marker.itemData.title);
            if (layer) {
                if (visible) {
                    layer.addLayer(marker);
                } else {
                    layer.removeLayer(marker);
                }
            }
        }
    }

    /**
     * Центрировать карту на маркере и открыть popup
     * @param {string} id - ID предмета
     */
    focusOnMarker(id) {
        const marker = this.markers.get(id);
        if (marker) {
            // Приближаем карту к маркеру (zoom 3 для сильного приближения)
            this.map.setView(marker.getLatLng(), 3);
            
            // Эмулируем клик по маркеру для открытия popup
            // Задержка даёт время на завершение анимации перемещения
            setTimeout(() => {
                marker.fire('click');
            }, 400);
        }
    }

    /**
     * Показать popup для маркера
     * @param {L.Marker} marker - Маркер
     * @param {string} content - HTML контент
     */
    showPopup(marker, content) {
        // Закрываем предыдущий popup если есть
        marker.unbindPopup();
        
        // Получаем позицию маркера на экране
        const markerPos = this.map.latLngToContainerPoint(marker.getLatLng());
        const mapSize = this.map.getSize();
        
        // Определяем направление открытия popup
        const openToLeft = markerPos.x > mapSize.x / 2;
        const openToTop = markerPos.y > mapSize.y / 2;
        
        // Вычисляем смещение popup
        const offsetX = openToLeft ? -150 : 150;
        const offsetY = openToTop ? -10 : 10;
        
        const popup = marker.bindPopup(content, {
            maxWidth: 320,
            minWidth: 280,
            closeButton: true,
            className: 'dark-popup',
            autoPan: true,
            autoPanPadding: [80, 80],
            offset: [0, -10]
        }).openPopup();

        // Обновляем popup после загрузки изображения
        setTimeout(() => {
            const popupEl = marker.getPopup();
            if (popupEl) {
                const img = popupEl.getElement()?.querySelector('.popup-image');
                if (img) {
                    img.onload = () => {
                        popupEl.update();
                    };
                    // Если изображение уже загружено (из кэша)
                    if (img.complete) {
                        popupEl.update();
                    }
                }
            }
        }, 50);
    }
}

// ============================================
// UI CONTROLLER - Управление интерфейсом
// ============================================
class UIController {
    constructor() {
        // DOM элементы
        this.sidebar = document.getElementById('sidebar');
        this.toggleBtn = document.getElementById('toggle-sidebar');
        this.regionSelect = document.getElementById('region-select');
        this.areaSelect = document.getElementById('area-select');
        this.classificationFilters = document.getElementById('classification-filters');
        this.resetBtn = document.getElementById('reset-collected-btn');
        
        // Панель "Не собрано"
        this.uncollectedBtn = document.getElementById('uncollected-btn');
        this.uncollectedPanel = document.getElementById('uncollected-panel');
        this.uncollectedContent = document.getElementById('uncollected-content');
        this.closeUncollectedBtn = document.getElementById('close-uncollected-btn');
        this.panelOverlay = document.getElementById('panel-overlay');

        // Кнопки бэкапа
        this.exportBackupBtn = document.getElementById('export-backup-btn');
        this.importBackupBtn = document.getElementById('import-backup-btn');
        this.importFileInput = document.getElementById('import-file-input');
    }

    /**
     * Инициализация обработчиков событий
     */
    initializeEventListeners(callbacks) {
        // Сворачивание сайдбара
        this.toggleBtn.addEventListener('click', () => {
            this.sidebar.classList.toggle('collapsed');
        });

        // Кнопка закрытия сайдбара (внутри сайдбара, для мобильных)
        const closeSidebarBtn = document.getElementById('close-sidebar-btn');
        if (closeSidebarBtn) {
            closeSidebarBtn.addEventListener('click', () => {
                this.sidebar.classList.add('collapsed');
            });
        }

        // Закрытие сайдбара при клике на карту (мобильные)
        document.getElementById('map').addEventListener('click', () => {
            if (window.innerWidth <= 768 && !this.sidebar.classList.contains('collapsed')) {
                this.sidebar.classList.add('collapsed');
            }
        });

        // Выбор региона
        this.regionSelect.addEventListener('change', (e) => {
            callbacks.onRegionChange(e.target.value);
        });

        // Выбор области
        this.areaSelect.addEventListener('change', (e) => {
            callbacks.onAreaChange(e.target.value);
        });

        // Сброс прогресса
        this.resetBtn.addEventListener('click', () => callbacks.onResetProgress());

        // Панель "Не собрано"
        this.uncollectedBtn.addEventListener('click', () => {
            this.openUncollectedPanel();
            callbacks.onOpenUncollected();
        });

        this.closeUncollectedBtn.addEventListener('click', () => {
            this.closeUncollectedPanel();
        });

        this.panelOverlay.addEventListener('click', () => {
            this.closeUncollectedPanel();
        });

        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.uncollectedPanel.classList.contains('hidden')) {
                this.closeUncollectedPanel();
            }
        });

        // Бэкап - экспорт
        this.exportBackupBtn.addEventListener('click', () => {
            callbacks.onExportBackup();
        });

        // Бэкап - импорт (открытие диалога выбора файла)
        this.importBackupBtn.addEventListener('click', () => {
            this.importFileInput.click();
        });

        // Бэкап - обработка выбранного файла
        this.importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                callbacks.onImportBackup(file);
                // Сбрасываем input, чтобы можно было загрузить тот же файл повторно
                this.importFileInput.value = '';
            }
        });
    }

    /**
     * Открыть панель "Не собрано"
     */
    openUncollectedPanel() {
        this.uncollectedPanel.classList.remove('hidden');
        this.panelOverlay.classList.remove('hidden');
    }

    /**
     * Закрыть панель "Не собрано"
     */
    closeUncollectedPanel() {
        this.uncollectedPanel.classList.add('hidden');
        this.panelOverlay.classList.add('hidden');
    }

    /**
     * Свернуть сайдбар
     */
    collapseSidebar() {
        this.sidebar.classList.add('collapsed');
    }

    /**
     * Отобразить несобранные предметы
     * @param {Array<Object>} items - Несобранные предметы
     * @param {Function} onCollect - Колбэк при отметке собранным
     * @param {Function} onNavigate - Колбэк при переходе к предмету
     */
    renderUncollectedItems(items, onCollect, onNavigate) {
        if (items.length === 0) {
            this.uncollectedContent.innerHTML = `
                <div class="all-collected-message">
                    <span class="emoji">🎉</span>
                    <h3>Поздравляем!</h3>
                    <p>Все предметы в этой области собраны</p>
                </div>
            `;
            return;
        }

        const tableHTML = `
            <table class="uncollected-table">
                <thead>
                    <tr>
                        <th>Изображение</th>
                        <th>Тип / Название</th>
                        <th>Как собрать</th>
                        <th>Действие</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => `
                        <tr data-id="${item.id}">
                            <td>
                                <img class="item-image" 
                                     src="${item.popupImage || item.pinIcon || CONFIG.DEFAULT_ICON_URL}" 
                                     alt="${translateItem(item.title)}"
                                     onclick="openLightbox('${item.popupImage || item.pinIcon || ''}')"
                                     onerror="this.src='${CONFIG.DEFAULT_ICON_URL}'">
                            </td>
                            <td>
                                <div class="item-type">${translateItem(item.classification || 'Unknown')}</div>
                                <div class="item-title">${translateItem(item.title)}</div>
                            </td>
                            <td>
                                <div class="item-description">${item.description || 'Описание отсутствует'}</div>
                            </td>
                            <td>
                                <div class="action-buttons">
                                    <button class="navigate-item-btn" data-id="${item.id}" title="Перейти к предмету">
                                        📍 Перейти
                                    </button>
                                    <button class="collect-item-btn" data-id="${item.id}" title="Отметить собранным">
                                        ✓ Собрано
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        this.uncollectedContent.innerHTML = tableHTML;

        // Добавляем обработчики для кнопок "Собрано"
        this.uncollectedContent.querySelectorAll('.collect-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                onCollect(id);
            });
        });

        // Добавляем обработчики для кнопок "Перейти"
        this.uncollectedContent.querySelectorAll('.navigate-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                if (onNavigate) {
                    onNavigate(id);
                }
            });
        });
    }

    /**
     * Удалить предмет из панели (с анимацией)
     * @param {string} id - ID предмета
     */
    removeUncollectedItem(id) {
        const row = this.uncollectedContent.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            row.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            row.style.opacity = '0';
            row.style.transform = 'translateX(20px)';
            setTimeout(() => {
                row.remove();
                // Проверяем, остались ли предметы
                const remainingRows = this.uncollectedContent.querySelectorAll('tbody tr');
                if (remainingRows.length === 0) {
                    this.renderUncollectedItems([], null);
                }
            }, 300);
        }
    }

    /**
     * Заполнить селект регионов
     * @param {Array<string>} regions - Список регионов
     */
    populateRegions(regions) {
        this.regionSelect.innerHTML = '<option value="">-- Выберите регион --</option>';
        regions.forEach(region => {
            const option = document.createElement('option');
            option.value = region;
            option.textContent = translateRegion(region);
            this.regionSelect.appendChild(option);
        });
    }

    /**
     * Заполнить селект областей
     * @param {Array<string>} areas - Список областей
     */
    populateAreas(areas) {
        this.areaSelect.innerHTML = '<option value="">-- Выберите область --</option>';
        this.areaSelect.disabled = areas.length === 0;
        
        areas.forEach(area => {
            const option = document.createElement('option');
            option.value = area;
            // Убираем префикс региона для отображения и переводим
            const [, areaName] = area.split(':');
            option.textContent = translateArea(areaName || area);
            this.areaSelect.appendChild(option);
        });
    }

    /**
     * Отобразить фильтры по классификации
     * @param {Array<Object>} classifications - Список классификаций
     * @param {Function} onToggle - Колбэк переключения
     */
    populateClassificationFilters(classifications, onToggle) {
        if (classifications.length === 0) {
            this.classificationFilters.innerHTML = '<p class="placeholder-text">Нет данных</p>';
            return;
        }

        this.classificationFilters.innerHTML = '';
        
        classifications.forEach(cls => {
            const item = document.createElement('label');
            item.className = 'filter-item';
            item.dataset.classification = cls.name;
            const translatedName = translateItem(cls.name);
            item.innerHTML = `
                <input type="checkbox" checked data-classification="${cls.name}">
                <img class="filter-icon" src="${cls.icon}" alt="${translatedName}" onerror="this.style.display='none'">
                <span class="filter-label">${translatedName}</span>
                <span class="filter-count" data-classification="${cls.name}">${cls.collected}/${cls.count}</span>
            `;
            
            const checkbox = item.querySelector('input');
            checkbox.addEventListener('change', () => {
                onToggle(cls.name, checkbox.checked);
            });
            
            this.classificationFilters.appendChild(item);
        });
    }

    /**
     * Обновить счётчик собранных в фильтре
     * @param {string} classification - Название классификации
     * @param {number} collected - Количество собранных
     * @param {number} total - Общее количество
     */
    updateFilterCount(classification, collected, total) {
        const countEl = this.classificationFilters.querySelector(`.filter-count[data-classification="${classification}"]`);
        if (countEl) {
            countEl.textContent = `${collected}/${total}`;
        }
    }

    /**
     * Установить состояние чекбокса фильтра
     * @param {string} classification - Название классификации
     * @param {boolean} checked - Состояние чекбокса
     */
    setFilterChecked(classification, checked) {
        const checkbox = this.classificationFilters.querySelector(`input[data-classification="${classification}"]`);
        if (checkbox) {
            checkbox.checked = checked;
        }
    }

    /**
     * Показать уведомление
     * @param {string} message - Текст сообщения
     * @param {boolean} isError - Ошибка ли это
     */
    showToast(message, isError = false) {
        // Удаляем существующие тосты
        document.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : ''}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Показываем с анимацией
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Скрываем через 3 секунды
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// ============================================
// ГЛАВНОЕ ПРИЛОЖЕНИЕ
// ============================================
class ArknightsMapApp {
    constructor() {
        this.dataManager = new DataManager();
        this.storageManager = new StorageManager();
        this.mapController = new MapController('map');
        this.uiController = new UIController();
        
        this.currentRegion = null;
        this.currentArea = null;
        this.currentItems = [];
        this.currentClassifications = [];
        this.preloadedImages = new Map(); // url -> HTMLImageElement
    }

    /**
     * Инициализация приложения
     */
    async initialize() {
        // Загружаем данные
        const loaded = await this.dataManager.loadData('map.json');
        if (!loaded) {
            this.uiController.showToast('Ошибка загрузки данных карты', true);
            return;
        }

        // Загружаем и применяем переводы описаний
        await this.loadAndApplyTranslations();

        // Заполняем регионы
        const regions = this.dataManager.getRegions();
        this.uiController.populateRegions(regions);

        // Инициализируем обработчики
        this.uiController.initializeEventListeners({
            onRegionChange: (region) => this.handleRegionChange(region),
            onAreaChange: (area) => this.handleAreaChange(area),
            onResetProgress: () => this.handleResetProgress(),
            onOpenUncollected: () => this.handleOpenUncollected(),
            onExportBackup: () => this.handleExportBackup(),
            onImportBackup: (file) => this.handleImportBackup(file)
        });

        // Предзагружаем все изображения карт
        this.preloadAllMapImages();

        // Загружаем область по умолчанию: Valley IV:The Hub
        await this.loadDefaultArea();
    }

    /**
     * Предзагрузка всех изображений карт
     */
    preloadAllMapImages() {
        const urls = this.dataManager.getAllAreaImageUrls();
        console.log(`Предзагрузка ${urls.length} изображений карт...`);
        
        urls.forEach(url => {
            const img = new Image();
            img.onload = () => {
                this.preloadedImages.set(url, img);
            };
            img.onerror = () => {
                console.warn(`Не удалось предзагрузить: ${url}`);
            };
            img.src = url;
        });
    }

    /**
     * Загрузка и применение переводов описаний из descriptions.json
     */
    async loadAndApplyTranslations() {
        try {
            const response = await fetch('descriptions.json');
            if (!response.ok) {
                console.warn('Не удалось загрузить descriptions.json');
                return;
            }
            
            const data = await response.json();
            if (!data.descriptions || !Array.isArray(data.descriptions)) {
                console.warn('Некорректный формат descriptions.json');
                return;
            }
            
            // Создаём карту id -> переведённое описание
            const translationMap = new Map();
            data.descriptions.forEach(entry => {
                if (entry.translated && entry.ids) {
                    entry.ids.forEach(id => {
                        translationMap.set(id, entry.translated);
                    });
                }
            });
            
            // Применяем переводы к координатам
            this.dataManager.coordinates.forEach(item => {
                if (translationMap.has(item.id)) {
                    item.description = translationMap.get(item.id);
                }
            });
            
            console.log(`Применено ${translationMap.size} переводов описаний`);
        } catch (error) {
            console.warn('Ошибка загрузки переводов:', error);
        }
    }

    /**
     * Загрузить область по умолчанию
     */
    async loadDefaultArea() {
        const defaultRegion = 'Valley IV';
        const defaultArea = 'Valley IV:The Hub';
        
        // Устанавливаем регион
        this.uiController.regionSelect.value = defaultRegion;
        this.handleRegionChange(defaultRegion);
        
        // Устанавливаем область
        this.uiController.areaSelect.value = defaultArea;
        await this.handleAreaChange(defaultArea);
    }

    /**
     * Обработка смены региона
     */
    handleRegionChange(region) {
        this.currentRegion = region;
        this.currentArea = null;
        
        if (!region) {
            this.uiController.populateAreas([]);
            return;
        }

        const areas = this.dataManager.getAreasForRegion(region);
        this.uiController.populateAreas(areas);
    }

    /**
     * Обработка смены области
     */
    async handleAreaChange(area) {
        this.currentArea = area;
        
        if (!area) {
            return;
        }

        // Получаем URL изображения
        const imageUrl = this.dataManager.getAreaImageUrl(area);
        if (!imageUrl) {
            this.uiController.showToast('Изображение карты не найдено', true);
            return;
        }

        // Инициализируем карту
        this.mapController.initialize();

        try {
            // Загружаем изображение
            await this.mapController.loadMapImage(imageUrl);
            
            // Получаем предметы для области
            this.currentItems = this.dataManager.getItemsForArea(area);
            
            // Добавляем маркеры
            this.mapController.addMarkers(
                this.currentItems,
                this.storageManager,
                (item, marker) => this.handleMarkerClick(item, marker)
            );

            // Получаем сохранённые настройки видимости
            const savedVisibility = this.storageManager.getVisibility(area);

            // Обновляем фильтры классификации (с подсчётом собранных)
            this.currentClassifications = this.dataManager.getClassificationsForArea(area, this.storageManager);
            this.uiController.populateClassificationFilters(this.currentClassifications, (cls, visible) => {
                this.mapController.toggleClassificationLayer(cls, visible);
                // Сохраняем настройки видимости
                const currentVisibility = this.storageManager.getVisibility(area);
                currentVisibility[cls] = visible;
                this.storageManager.setVisibility(area, currentVisibility);
            });

            // Применяем сохранённые настройки видимости
            Object.entries(savedVisibility).forEach(([cls, visible]) => {
                if (!visible) {
                    this.mapController.toggleClassificationLayer(cls, false);
                    this.uiController.setFilterChecked(cls, false);
                }
            });

            const areaName = area.split(':')[1];
            this.uiController.showToast(`Загружена область: ${translateArea(areaName)}`);
            
            // На мобильных автоматически скрываем сайдбар после выбора области
            if (window.innerWidth <= 768) {
                this.uiController.collapseSidebar();
            }
            
        } catch (e) {
            console.error('Ошибка загрузки карты:', e);
            this.uiController.showToast('Ошибка загрузки карты', true);
        }
    }

    /**
     * Обработка клика по маркеру
     */
    handleMarkerClick(item, marker) {
        const isCollected = this.storageManager.isCollected(item.id);
        const translatedTitle = translateItem(item.title);
        
        const popupContent = `
            <div class="custom-popup">
                <h3 class="popup-title">${translatedTitle}</h3>
                <p class="popup-description">${item.description || 'Описание отсутствует'}</p>
                ${item.popupImage ? `
                    <div class="popup-image-container">
                        <img class="popup-image" src="${item.popupImage}" alt="${translatedTitle}" 
                             onclick="openLightbox('${item.popupImage}')">
                    </div>
                ` : ''}
                <div class="popup-actions">
                    ${item.popupImage ? `
                        <button class="btn btn-primary open-image-btn" onclick="window.open('${item.popupImage}', '_blank')">
                            📷 Открыть изображение
                        </button>
                    ` : ''}
                    <button class="btn ${isCollected ? 'btn-danger collect-btn collected' : 'btn-success collect-btn'}" 
                            onclick="markCollected('${item.id}')">
                        ${isCollected ? '✗ Снять отметку' : '✓ Отметить собранным'}
                    </button>
                </div>
            </div>
        `;

        this.mapController.showPopup(marker, popupContent);
    }

    /**
     * Переключить состояние "собрано"
     */
    toggleCollected(id) {
        const currentState = this.storageManager.isCollected(id);
        const newState = !currentState;
        
        this.storageManager.setCollected(id, newState);
        this.mapController.updateMarkerIcon(id, newState);
        
        // Обновляем счётчик в фильтре
        this.updateClassificationCount(id, newState);
        
        // Синхронизируем панель "Не собрано"
        if (newState) {
            // Предмет отмечен как собранный - удаляем из панели
            this.uiController.removeUncollectedItem(id);
        }
        
        this.uiController.showToast(newState ? 'Предмет отмечен как собранный' : 'Отметка снята');
    }

    /**
     * Обработка открытия панели "Не собрано"
     */
    handleOpenUncollected() {
        this.refreshUncollectedPanel();
    }

    /**
     * Обновить содержимое панели "Не собрано"
     */
    refreshUncollectedPanel() {
        if (!this.currentArea || this.currentItems.length === 0) {
            this.uiController.renderUncollectedItems([], null);
            return;
        }

        // Фильтруем только несобранные предметы
        const uncollectedItems = this.currentItems.filter(
            item => !this.storageManager.isCollected(item.id)
        );

        // Рендерим панель
        this.uiController.renderUncollectedItems(
            uncollectedItems, 
            (id) => {
                this.toggleCollected(id);
            },
            (id) => {
                this.navigateToItem(id);
            }
        );
    }

    /**
     * Перейти к предмету на карте
     * @param {string} id - ID предмета
     */
    navigateToItem(id) {
        // Закрываем панель "Не собрано"
        this.uiController.closeUncollectedPanel();
        
        // Фокусируемся на маркере
        this.mapController.focusOnMarker(id);
    }

    /**
     * Обновить счётчик собранных в фильтре по классификации
     */
    updateClassificationCount(itemId, isCollected) {
        // Находим предмет и его title (используем title вместо classification)
        const item = this.currentItems.find(i => i.id === itemId);
        if (!item) return;
        
        const classification = item.title || 'Unknown';
        const classData = this.currentClassifications.find(c => c.name === classification);
        if (!classData) return;
        
        // Обновляем счётчик
        if (isCollected) {
            classData.collected++;
        } else {
            classData.collected = Math.max(0, classData.collected - 1);
        }
        
        // Обновляем UI
        this.uiController.updateFilterCount(classification, classData.collected, classData.count);
    }

    /**
     * Сбросить прогресс области
     */
    handleResetProgress() {
        if (!this.currentArea || this.currentItems.length === 0) {
            this.uiController.showToast('Сначала выберите область', true);
            return;
        }

        if (!confirm('Вы уверены, что хотите сбросить прогресс для этой области?')) {
            return;
        }

        const ids = this.currentItems.map(item => item.id);
        this.storageManager.resetAreaProgress(ids);

        // Обновляем маркеры
        ids.forEach(id => {
            this.mapController.updateMarkerIcon(id, false);
        });

        // Обновляем все счётчики в фильтрах
        this.currentClassifications.forEach(cls => {
            cls.collected = 0;
            this.uiController.updateFilterCount(cls.name, 0, cls.count);
        });

        // Обновляем панель "Не собрано" если она открыта
        if (!this.uiController.uncollectedPanel.classList.contains('hidden')) {
            this.refreshUncollectedPanel();
        }

        this.uiController.showToast('Прогресс области сброшен');
    }

    /**
     * Экспорт бэкапа в файл
     */
    handleExportBackup() {
        const backup = this.storageManager.exportBackup();
        if (!backup) {
            this.uiController.showToast('Ошибка при создании бэкапа', true);
            return;
        }

        const dataStr = JSON.stringify(backup, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `arknights_endfield_backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.uiController.showToast('Бэкап успешно сохранён');
    }

    /**
     * Импорт бэкапа из файла
     */
    handleImportBackup(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const backup = JSON.parse(e.target.result);
                
                if (!confirm('Импорт бэкапа заменит текущий прогресс. Продолжить?')) {
                    return;
                }

                const success = this.storageManager.importBackup(backup);
                if (success) {
                    this.uiController.showToast('Бэкап успешно загружен. Перезагрузите страницу для применения изменений.');
                    
                    // Перезагружаем текущую область для обновления маркеров
                    if (this.currentArea) {
                        this.handleAreaChange(this.currentArea);
                    }
                } else {
                    this.uiController.showToast('Ошибка при импорте бэкапа', true);
                }
            } catch (err) {
                console.error('Ошибка парсинга файла бэкапа:', err);
                this.uiController.showToast('Неверный формат файла бэкапа', true);
            }
        };

        reader.onerror = () => {
            this.uiController.showToast('Ошибка чтения файла', true);
        };

        reader.readAsText(file);
    }
}

// ============================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const app = new ArknightsMapApp();
    app.initialize();
    
    // Сохраняем ссылку на приложение для глобальных функций
    appInstance = app;
});

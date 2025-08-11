const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// 配置管理
class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        return {
            // 基础配置
            API_ENDPOINT: process.env.API_ENDPOINT || 'https://ipapi.co/json/',
            API_TIMEOUT: parseInt(process.env.API_TIMEOUT || '15000', 10),
            
            // 多源定位配置
            ENABLE_MULTI_SOURCE: process.env.ENABLE_MULTI_SOURCE === 'true',
            MIN_CONFIDENCE_THRESHOLD: parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD || '0.6'),
            MAX_API_CALLS: parseInt(process.env.MAX_API_CALLS || '3', 10),
            
            // 缓存配置
            ENABLE_CACHE: process.env.ENABLE_CACHE !== 'false',
            CACHE_TTL: parseInt(process.env.CACHE_TTL || '3600000', 10), // 1小时
            CACHE_FILE: process.env.CACHE_FILE || 'location_cache.json',
            
            // API密钥配置
            AMAP_API_KEY: process.env.AMAP_API_KEY || 'e89469983d5dbc8dddc5466b4f72a6cd',
            GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
            BAIDU_MAPS_API_KEY: process.env.BAIDU_MAPS_API_KEY,
            IPINFO_TOKEN: process.env.IPINFO_TOKEN,
            MAXMIND_API_KEY: process.env.MAXMIND_API_KEY,
            
            // 性能监控
            ENABLE_PERFORMANCE_MONITORING: process.env.ENABLE_PERFORMANCE_MONITORING !== 'false',
            PERFORMANCE_LOG_FILE: process.env.PERFORMANCE_LOG_FILE || 'performance.log'
        };
    }

    get(key) {
        return this.config[key];
    }

    getAll() {
        return this.config;
    }
}

// 性能监控
class PerformanceMonitor {
    constructor(config) {
        this.config = config;
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            apiStats: {},
            cacheHits: 0,
            cacheMisses: 0
        };
        this.responseTimes = [];
    }

    recordRequest(apiName, responseTime, success) {
        this.metrics.totalRequests++;
        this.responseTimes.push(responseTime);
        
        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }

        if (!this.metrics.apiStats[apiName]) {
            this.metrics.apiStats[apiName] = {
                requests: 0,
                successes: 0,
                failures: 0,
                averageResponseTime: 0,
                responseTimes: []
            };
        }

        const apiStats = this.metrics.apiStats[apiName];
        apiStats.requests++;
        apiStats.responseTimes.push(responseTime);
        
        if (success) {
            apiStats.successes++;
        } else {
            apiStats.failures++;
        }

        this.updateAverages();
    }

    recordCacheHit() {
        this.metrics.cacheHits++;
    }

    recordCacheMiss() {
        this.metrics.cacheMisses++;
    }

    updateAverages() {
        if (this.responseTimes.length > 0) {
            this.metrics.averageResponseTime = 
                this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
        }

        for (const [apiName, stats] of Object.entries(this.metrics.apiStats)) {
            if (stats.responseTimes.length > 0) {
                stats.averageResponseTime = 
                    stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
            }
        }
    }

    getMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalRequests > 0 ? 
                (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2) + '%' : '0%',
            cacheHitRate: this.metrics.cacheHits + this.metrics.cacheMisses > 0 ?
                (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2) + '%' : '0%'
        };
    }
}

// 智能缓存系统
class LocationCache {
    constructor(config) {
        this.config = config;
        this.cache = new Map();
        this.cacheFile = config.get('CACHE_FILE');
        this.loadCache();
    }

    loadCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = fs.readFileSync(this.cacheFile, 'utf8');
                const cacheData = JSON.parse(data);
                this.cache = new Map(Object.entries(cacheData));
                
                // 清理过期缓存
                this.cleanupExpired();
            }
        } catch (error) {
            console.error('[LocationCache] Failed to load cache:', error.message);
        }
    }

    saveCache() {
        try {
            const cacheData = Object.fromEntries(this.cache);
            fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
        } catch (error) {
            console.error('[LocationCache] Failed to save cache:', error.message);
        }
    }

    cleanupExpired() {
        const now = Date.now();
        const ttl = this.config.get('CACHE_TTL');
        
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > ttl) {
                this.cache.delete(key);
            }
        }
    }

    get(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const now = Date.now();
        const ttl = this.config.get('CACHE_TTL');
        
        if (now - cached.timestamp > ttl) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    set(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
        this.saveCache();
    }

    clear() {
        this.cache.clear();
        this.saveCache();
    }
}

// 初始化配置和监控
const config = new ConfigManager();
const performanceMonitor = new PerformanceMonitor(config);
const locationCache = new LocationCache(config);

// API配置
const API_CONFIG = {
    // IP定位API
    ipApis: [
        {
            name: 'ipapi_co',
            url: 'https://ipapi.co/json/',
            priority: 1,
            timeout: config.get('API_TIMEOUT')
        },
        {
            name: 'ipwho_is',
            url: 'https://ipwho.is/',
            priority: 2,
            timeout: config.get('API_TIMEOUT')
        },
        {
            name: 'ipinfo_io',
            url: 'https://ipinfo.io/json/',
            priority: 3,
            timeout: config.get('API_TIMEOUT'),
            token: config.get('IPINFO_TOKEN')
        },
        {
            name: 'ip_api_com',
            url: 'http://ip-api.com/json/',
            priority: 4,
            timeout: config.get('API_TIMEOUT')
        }
    ],

    // 地图服务API
    mapApis: [
        {
            name: 'amap_ip',
            apiKey: config.get('AMAP_API_KEY'),
            url: 'https://restapi.amap.com/v3/ip',
            priority: 1,
            timeout: config.get('API_TIMEOUT')
        },
        {
            name: 'google_maps',
            apiKey: config.get('GOOGLE_MAPS_API_KEY'),
            url: 'https://www.googleapis.com/geolocation/v1/geolocate',
            priority: 2,
            timeout: config.get('API_TIMEOUT')
        },
        {
            name: 'baidu_maps',
            apiKey: config.get('BAIDU_MAPS_API_KEY'),
            url: 'https://api.map.baidu.com/location/ip',
            priority: 3,
            timeout: config.get('API_TIMEOUT')
        }
    ]
};

// 多源定位引擎
class MultiSourceLocationEngine {
    constructor(config, cache, monitor) {
        this.config = config;
        this.cache = cache;
        this.monitor = monitor;
    }

    // 智能API选择
    async getOptimalLocation() {
        const cacheKey = 'location_optimal';
        
        // 检查缓存
        if (this.config.get('ENABLE_CACHE')) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.monitor.recordCacheHit();
                return cached;
            }
            this.monitor.recordCacheMiss();
        }

        // 多源融合模式
        if (this.config.get('ENABLE_MULTI_SOURCE')) {
            return await this.getMultiSourceLocation();
        }

        // 单源模式 - 按优先级尝试
        return await this.getPriorityLocation();
    }

    // 多源融合定位
    async getMultiSourceLocation() {
        const maxCalls = this.config.get('MAX_API_CALLS');
        const minConfidence = this.config.get('MIN_CONFIDENCE_THRESHOLD');
        const results = [];

        // 按优先级并发调用多个API
        const apiPromises = this.getSortedApis().slice(0, maxCalls).map(async (api) => {
            try {
                const result = await this.callApi(api);
                if (result && this.calculateConfidence(result) >= minConfidence) {
                    results.push(result);
                }
            } catch (error) {
                console.error(`[MultiSource] API ${api.name} failed:`, error.message);
            }
        });

        await Promise.allSettled(apiPromises);

        if (results.length === 0) {
            throw new Error('All location APIs failed');
        }

        // 融合结果
        const fusedResult = this.fuseResults(results);
        
        // 缓存结果
        if (this.config.get('ENABLE_CACHE')) {
            this.cache.set(cacheKey, fusedResult);
        }

        return fusedResult;
    }

    // 优先级定位
    async getPriorityLocation() {
        const cacheKey = 'location_optimal';
        const sortedApis = this.getSortedApis();
        
        for (const api of sortedApis) {
            try {
                const result = await this.callApi(api);
                
                // 缓存结果
                if (this.config.get('ENABLE_CACHE')) {
                    this.cache.set(cacheKey, result);
                }
                
                return result;
            } catch (error) {
                console.error(`[Priority] API ${api.name} failed:`, error.message);
                continue;
            }
        }

        throw new Error('All location APIs failed');
    }

    // 获取排序后的API列表
    getSortedApis() {
        const allApis = [
            ...API_CONFIG.mapApis.filter(api => api.apiKey),
            ...API_CONFIG.ipApis
        ];

        return allApis.sort((a, b) => a.priority - b.priority);
    }

    // 调用API
    async callApi(api) {
        const startTime = Date.now();
        
        try {
            let result;
            
            if (api.name === 'amap_ip') {
                result = await this.callAmapApi(api);
            } else if (api.name === 'google_maps') {
                result = await this.callGoogleMapsApi(api);
            } else if (api.name === 'baidu_maps') {
                result = await this.callBaiduMapsApi(api);
            } else {
                result = await this.callIpApi(api);
            }

            const responseTime = Date.now() - startTime;
            this.monitor.recordRequest(api.name, responseTime, true);
            
            return result;
        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.monitor.recordRequest(api.name, responseTime, false);
            throw error;
        }
    }

    // 高德地图API
    async callAmapApi(api) {
        const apiUrl = `${api.url}?key=${api.apiKey}&output=json`;
        
        return new Promise((resolve, reject) => {
            this.makeHttpRequest(apiUrl, api.timeout, (error, data) => {
                if (error) return reject(error);
                
                try {
                    const jsonData = JSON.parse(data);
                    
                    if (jsonData.status === '1' && (jsonData.rectangle || jsonData.location)) {
                        const rectangle = jsonData.rectangle.split(';');
                        const startCoord = rectangle[0].split(',');
                        const endCoord = rectangle[1].split(',');
                        
                        const latitude = (parseFloat(startCoord[1]) + parseFloat(endCoord[1])) / 2;
                        const longitude = (parseFloat(startCoord[0]) + parseFloat(endCoord[0])) / 2;
                        
                        const result = {
                            latitude: latitude,
                            longitude: longitude,
                            city: jsonData.city,
                            province: jsonData.province,
                            country: '中国',
                            adcode: jsonData.adcode,
                            rectangle: jsonData.rectangle,
                            location_type: 'ip',
                            source: 'amap_ip_api',
                            _metadata: {
                                source_api: 'AMap IP API',
                                timestamp: new Date().toISOString(),
                                confidence: 'medium',
                                confidence_score: 0.8,
                                accuracy_notes: [
                                    '基于高德地图IP定位',
                                    '精度: 城市级'
                                ]
                            }
                        };
                        
                        resolve(result);
                    } else {
                        reject(new Error(`AMap API error: ${jsonData.info}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse AMap API response: ${e.message}`));
                }
            });
        });
    }

    // Google Maps API
    async callGoogleMapsApi(api) {
        const apiUrl = `${api.url}?key=${api.apiKey}`;
        
        return new Promise((resolve, reject) => {
            this.makeHttpRequest(apiUrl, api.timeout, (error, data) => {
                if (error) return reject(error);
                
                try {
                    const jsonData = JSON.parse(data);
                    
                    if (jsonData.location) {
                        const result = {
                            latitude: jsonData.location.lat,
                            longitude: jsonData.location.lng,
                            accuracy: jsonData.accuracy,
                            location_type: 'wifi/gps/cell',
                            source: 'google_maps_api',
                            _metadata: {
                                source_api: 'Google Maps Geolocation API',
                                timestamp: new Date().toISOString(),
                                confidence: 'high',
                                confidence_score: 0.9,
                                accuracy_notes: [
                                    '基于Google Maps多源定位',
                                    '支持WiFi、GPS、基站定位',
                                    '精度: 10-100米'
                                ]
                            }
                        };
                        
                        resolve(result);
                    } else {
                        reject(new Error('Google Maps API: No location data'));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Google Maps API response: ${e.message}`));
                }
            });
        });
    }

    // 百度地图API
    async callBaiduMapsApi(api) {
        const apiUrl = `${api.url}?ak=${api.apiKey}&coor=bd09ll`;
        
        return new Promise((resolve, reject) => {
            this.makeHttpRequest(apiUrl, api.timeout, (error, data) => {
                if (error) return reject(error);
                
                try {
                    const jsonData = JSON.parse(data);
                    
                    if (jsonData.status === 0 && jsonData.content) {
                        const result = {
                            latitude: jsonData.content.point.y,
                            longitude: jsonData.content.point.x,
                            city: jsonData.content.address_detail.city,
                            province: jsonData.content.address_detail.province,
                            country: '中国',
                            location_type: 'ip/wifi',
                            source: 'baidu_maps_api',
                            _metadata: {
                                source_api: 'Baidu Maps API',
                                timestamp: new Date().toISOString(),
                                confidence: 'medium',
                                confidence_score: 0.75,
                                accuracy_notes: [
                                    '基于百度地图定位',
                                    '支持WiFi、IP定位',
                                    '精度: 城市级'
                                ]
                            }
                        };
                        
                        resolve(result);
                    } else {
                        reject(new Error(`Baidu Maps API error: ${jsonData.message}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Baidu Maps API response: ${e.message}`));
                }
            });
        });
    }

    // IP定位API
    async callIpApi(api) {
        const url = api.token ? `${api.url}?token=${api.token}` : api.url;
        
        return new Promise((resolve, reject) => {
            this.makeHttpRequest(url, api.timeout, (error, data) => {
                if (error) return reject(error);
                
                try {
                    const jsonData = JSON.parse(data);
                    const normalized = this.normalizeIpData(jsonData, api.name);
                    
                    if (normalized.latitude && normalized.longitude) {
                        resolve(normalized);
                    } else {
                        reject(new Error(`IP API ${api.name}: No valid coordinates`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse IP API ${api.name} response: ${e.message}`));
                }
            });
        });
    }

    // 标准化IP数据
    normalizeIpData(data, apiName) {
        let normalized = {};
        
        switch (apiName) {
            case 'ipapi_co':
                normalized = {
                    ip: data.ip,
                    country: data.country_name || data.country,
                    country_code: data.country_code,
                    region: data.region,
                    region_code: data.region_code,
                    city: data.city,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    isp: data.org || data.isp,
                    org: data.org,
                    timezone: data.timezone,
                    location_type: 'ip',
                    source: 'ipapi_co'
                };
                break;
                
            case 'ipwho_is':
                normalized = {
                    ip: data.ip,
                    country: data.country,
                    country_code: data.country_code,
                    region: data.region,
                    region_code: data.region_code,
                    city: data.city,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    isp: data.connection?.isp || data.isp,
                    org: data.connection?.org || data.org,
                    timezone: data.timezone?.id || data.timezone,
                    location_type: 'ip',
                    source: 'ipwho_is'
                };
                break;
                
            case 'ipinfo_io':
                const coords = data.loc ? data.loc.split(',') : [null, null];
                normalized = {
                    ip: data.ip,
                    country: data.country,
                    country_code: data.country,
                    region: data.region,
                    region_code: data.region,
                    city: data.city,
                    latitude: coords[0] ? parseFloat(coords[0]) : null,
                    longitude: coords[1] ? parseFloat(coords[1]) : null,
                    isp: data.org,
                    org: data.org,
                    timezone: data.timezone,
                    location_type: 'ip',
                    source: 'ipinfo_io'
                };
                break;
                
            case 'ip_api_com':
                normalized = {
                    ip: data.query,
                    country: data.country,
                    country_code: data.countryCode,
                    region: data.regionName,
                    region_code: data.region,
                    city: data.city,
                    latitude: data.lat,
                    longitude: data.lon,
                    isp: data.isp,
                    org: data.org,
                    timezone: data.timezone,
                    location_type: 'ip',
                    source: 'ip_api_com'
                };
                break;
        }
        
        // 添加元数据
        normalized._metadata = {
            source_api: apiName,
            timestamp: new Date().toISOString(),
            confidence: 'medium',
            confidence_score: 0.6,
            accuracy_notes: [
                `使用${apiName}服务`,
                '基于IP地理位置定位',
                '精度: 城市级'
            ]
        };
        
        return normalized;
    }

    // 计算置信度
    calculateConfidence(result) {
        if (!result._metadata) return 0.5;
        
        let confidence = result._metadata.confidence_score || 0.5;
        
        // 根据数据完整性调整
        if (result.city) confidence += 0.1;
        if (result.region) confidence += 0.1;
        if (result.country) confidence += 0.1;
        if (result.latitude && result.longitude) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    // 融合多个结果
    fuseResults(results) {
        if (results.length === 1) {
            return results[0];
        }

        // 计算平均坐标
        const validCoords = results.filter(r => r.latitude && r.longitude);
        const avgLat = validCoords.reduce((sum, r) => sum + r.latitude, 0) / validCoords.length;
        const avgLng = validCoords.reduce((sum, r) => sum + r.longitude, 0) / validCoords.length;

        // 获取最完整的信息
        const mostComplete = results.reduce((best, current) => {
            const bestScore = Object.keys(best).filter(k => k !== '_metadata').length;
            const currentScore = Object.keys(current).filter(k => k !== '_metadata').length;
            return currentScore > bestScore ? current : best;
        });

        // 创建融合结果
        const fusedResult = {
            ...mostComplete,
            latitude: avgLat,
            longitude: avgLng,
            source: 'multi_source_fusion',
            _metadata: {
                source_api: `Multi-source (${results.length} APIs)`,
                timestamp: new Date().toISOString(),
                confidence: 'high',
                confidence_score: Math.min(0.6 + (results.length * 0.1), 0.95),
                accuracy_notes: [
                    `基于${results.length}个数据源融合`,
                    `源API: ${results.map(r => r.source).join(', ')}`,
                    `融合置信度: ${Math.min(60 + (results.length * 10), 95)}%`
                ],
                individual_results: results.map(r => ({
                    source: r.source,
                    confidence: r._metadata.confidence_score,
                    confidence_level: r._metadata.confidence
                }))
            }
        };

        return fusedResult;
    }

    // HTTP请求工具
    makeHttpRequest(urlString, timeout, callback) {
        const parsedUrl = new URL(urlString);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.protocol === 'https:' ? 443 : 80,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            timeout: timeout,
            headers: {
                'User-Agent': 'VCP-LocationFinder/3.0',
                'Accept': 'application/json'
            }
        };

        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        const req = client.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    callback(null, data);
                } else {
                    callback(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });

        req.on('error', (e) => {
            callback(new Error(`Network error: ${e.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            callback(new Error(`Request timed out after ${timeout}ms`));
        });

        req.end();
    }
}

// 初始化多源定位引擎
const locationEngine = new MultiSourceLocationEngine(config, locationCache, performanceMonitor);

// 增强的主函数
async function main() {
    let inputData = '';
    
    // 读取输入
    for await (const chunk of process.stdin) {
        inputData += chunk;
    }

    try {
        // 尝试解析输入
        if (inputData) {
            const parsedInput = JSON.parse(inputData);
            
            // 处理特殊命令
            if (parsedInput.command === 'getMetrics') {
                const metrics = performanceMonitor.getMetrics();
                console.log(JSON.stringify({
                    status: "success",
                    result: metrics
                }));
                process.exit(0);
            }
            
            if (parsedInput.command === 'clearCache') {
                locationCache.clear();
                console.log(JSON.stringify({
                    status: "success",
                    result: { message: "Cache cleared successfully" }
                }));
                process.exit(0);
            }
            
            if (parsedInput.command === 'getConfig') {
                console.log(JSON.stringify({
                    status: "success",
                    result: config.getAll()
                }));
                process.exit(0);
            }
        }
    } catch (e) {
        console.error(JSON.stringify({ 
            status: "error", 
            error: "Invalid JSON input received.",
            details: e.message
        }));
        process.exit(1);
    }

    try {
        console.error('[LocationFinder] Starting location request...');
        const locationData = await locationEngine.getOptimalLocation();
        
        // 添加使用建议和性能信息
        const enhancedResult = {
            ...locationData,
            _usage_note: "多源地理位置定位服务。支持IP、WiFi、GPS等多种定位方式，提供高精度位置信息。",
            _performance: config.get('ENABLE_PERFORMANCE_MONITORING') ? performanceMonitor.getMetrics() : undefined
        };
        
        // 成功返回
        const output = {
            status: "success",
            result: enhancedResult
        };
        
        console.error('[LocationFinder] Location request completed successfully');
        console.log(JSON.stringify(output));
        process.exit(0);
        
    } catch (error) {
        console.error('[LocationFinder] Location request failed:', error.message);
        
        // 增强的错误处理
        const errorDetails = {
            message: error.message,
            timestamp: new Date().toISOString(),
            config: config.getAll(),
            metrics: performanceMonitor.getMetrics()
        };
        
        const output = {
            status: "error",
            error: "Failed to fetch location data.",
            details: errorDetails,
            suggestion: generateSuggestion(error)
        };
        
        console.error(JSON.stringify(output));
        process.exit(1);
    }
}

// 智能建议生成
function generateSuggestion(error) {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('timeout')) {
        return "请求超时，建议：1) 增加API_TIMEOUT配置值 2) 检查网络连接 3) 尝试使用其他API服务";
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('enetunreach')) {
        return "网络连接问题，建议：1) 检查网络连接 2) 确认防火墙设置 3) 稍后重试";
    }
    
    if (errorMessage.includes('api key') || errorMessage.includes('unauthorized')) {
        return "API密钥问题，建议：1) 检查API密钥配置 2) 确认API密钥有效性 3) 考虑使用其他API服务";
    }
    
    if (errorMessage.includes('all.*failed') || errorMessage.includes('no.*data')) {
        return "所有定位服务都失败了，建议：1) 检查网络连接 2) 确认API配置 3) 稍后重试 4) 联系系统管理员";
    }
    
    return "定位服务暂时不可用，请稍后重试。如问题持续存在，请联系系统管理员。";
}

// 启动应用
main().catch(error => {
    console.error('[LocationFinder] Fatal error:', error);
    process.exit(1);
});
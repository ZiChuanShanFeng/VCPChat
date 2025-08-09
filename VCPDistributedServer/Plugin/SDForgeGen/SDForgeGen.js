const fs = require('fs');
const path = require('path');

// Load environment variables from config.env file
function loadConfig() {
    const configPath = path.join(__dirname, 'config.env');
    if (fs.existsSync(configPath)) {
        const config = fs.readFileSync(configPath, 'utf8');
        config.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...valueParts] = trimmed.split('=');
                if (key && valueParts.length > 0) {
                    process.env[key.trim()] = valueParts.join('=').trim();
                }
            }
        });
    }
}

loadConfig();

// 增强参数识别的函数，处理同义词和大小写
function getParam(args, keys, defaultValue = undefined) {
    for (const key of keys) {
        if (args[key] !== undefined) {
            return args[key];
        }
    }
    // 尝试不区分大小写匹配
    const lowerCaseKeys = keys.map(k => k.toLowerCase());
    for (const argKey in args) {
        if (lowerCaseKeys.includes(argKey.toLowerCase())) {
            return args[argKey];
        }
    }
    return defaultValue;
}

// 获取API基础URL
function getBaseApiUrl() {
    let apiUrl = process.env.SD_FORGE_API_URL;
    if (!apiUrl) {
        throw new Error('SD_FORGE_API_URL is not set in the environment.');
    }
    
    // 移除端点，只保留基础URL
    return apiUrl.replace(/\/sdapi\/v1.*$/, '');
}

// 构建请求头
function buildHeaders() {
    const headers = {
        'Content-Type': 'application/json',
    };
    
    const username = process.env.SD_FORGE_USERNAME;
    const password = process.env.SD_FORGE_PASSWORD;
    
    if (username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
    }
    
    return headers;
}

// 获取可用模型列表
async function getModels() {
    const baseUrl = getBaseApiUrl();
    const response = await fetch(`${baseUrl}/sdapi/v1/sd-models`, {
        method: 'GET',
        headers: buildHeaders()
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get models: ${response.status}`);
    }
    
    return await response.json();
}

// 获取采样器列表
async function getSamplers() {
    const baseUrl = getBaseApiUrl();
    const response = await fetch(`${baseUrl}/sdapi/v1/samplers`, {
        method: 'GET',
        headers: buildHeaders()
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get samplers: ${response.status}`);
    }
    
    return await response.json();
}

// 获取调度器列表
async function getSchedulers() {
    const baseUrl = getBaseApiUrl();
    const response = await fetch(`${baseUrl}/sdapi/v1/schedulers`, {
        method: 'GET',
        headers: buildHeaders()
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get schedulers: ${response.status}`);
    }
    
    return await response.json();
}

// 获取LoRA列表
async function getLoras() {
    const baseUrl = getBaseApiUrl();
    const response = await fetch(`${baseUrl}/sdapi/v1/loras`, {
        method: 'GET',
        headers: buildHeaders()
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get loras: ${response.status}`);
    }
    
    return await response.json();
}

// 获取当前选项
async function getCurrentOptions() {
    const baseUrl = getBaseApiUrl();
    const response = await fetch(`${baseUrl}/sdapi/v1/options`, {
        method: 'GET',
        headers: buildHeaders()
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get options: ${response.status}`);
    }
    
    return await response.json();
}

// 切换模型
async function switchModel(modelTitle) {
    const baseUrl = getBaseApiUrl();
    const response = await fetch(`${baseUrl}/sdapi/v1/options`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
            "sd_model_checkpoint": modelTitle
        })
    });
    
    if (!response.ok) {
        throw new Error(`Failed to switch model: ${response.status}`);
    }
    
    return await response.json();
}

// 处理信息查询请求
async function handleInfoRequest(args) {
    const requestType = getParam(args, ['info', 'list', 'get', '获取', '查看', '列表']);
    
    if (!requestType) {
        return null;
    }
    
    const lowerType = requestType.toLowerCase();
    
    try {
        if (lowerType.includes('model') || lowerType.includes('模型')) {
            console.error('获取模型列表...');
            const models = await getModels();
            const options = await getCurrentOptions();
            const currentModel = options.sd_model_checkpoint;
            
            let modelList = '📋 **可用模型列表：**\n\n';
            models.forEach((model, index) => {
                const isCurrent = model.title === currentModel;
                const marker = isCurrent ? '✅ **[当前]**' : '  ';
                modelList += `${marker} ${index + 1}. **${model.model_name}**\n`;
                modelList += `     文件: \`${model.filename}\`\n`;
                if (model.hash) {
                    modelList += `     哈希: \`${model.hash.substring(0, 8)}...\`\n`;
                }
                modelList += `\n`;
            });
            
            modelList += `\n💡 **切换模型方法：**\n`;
            modelList += `使用参数: \`{"model": "模型名称"}\`\n`;
            modelList += `例如: \`{"model": "${models[0]?.title || 'model_name'}"}\``;
            
            return {
                content: [{
                    type: 'text',
                    text: modelList
                }]
            };
        }
        
        if (lowerType.includes('sampler') || lowerType.includes('采样') || lowerType.includes('采样器')) {
            console.error('获取采样器列表...');
            const samplers = await getSamplers();
            
            let samplerList = '🎛️ **可用采样器列表：**\n\n';
            samplers.forEach((sampler, index) => {
                samplerList += `${index + 1}. **${sampler.name}**\n`;
                if (sampler.aliases && sampler.aliases.length > 0) {
                    samplerList += `   别名: \`${sampler.aliases.join(', ')}\`\n`;
                }
            });
            
            samplerList += `\n💡 **使用方法：**\n`;
            samplerList += `使用参数: \`{"sampler_name": "采样器名称"}\`\n`;
            samplerList += `例如: \`{"sampler_name": "DPM++ 2M Karras"}\``;
            
            return {
                content: [{
                    type: 'text',
                    text: samplerList
                }]
            };
        }
        
        if (lowerType.includes('scheduler') || lowerType.includes('调度') || lowerType.includes('调度器')) {
            console.error('获取调度器列表...');
            const schedulers = await getSchedulers();
            
            let schedulerList = '⚙️ **可用调度器列表：**\n\n';
            schedulers.forEach((scheduler, index) => {
                schedulerList += `${index + 1}. **${scheduler.name}**\n`;
                if (scheduler.label && scheduler.label !== scheduler.name) {
                    schedulerList += `   标签: \`${scheduler.label}\`\n`;
                }
            });
            
            schedulerList += `\n💡 **使用方法：**\n`;
            schedulerList += `使用参数: \`{"scheduler": "调度器名称"}\`\n`;
            schedulerList += `例如: \`{"scheduler": "Karras"}\``;
            
            return {
                content: [{
                    type: 'text',
                    text: schedulerList
                }]
            };
        }
        
        if (lowerType.includes('lora') || lowerType.includes('LoRA') || lowerType.includes('LORA')) {
            console.error('获取LoRA列表...');
            const loras = await getLoras();
            
            // 基于文件路径去重，因为不同LoRA可能有相同哈希
            const uniqueLoras = [];
            const seenPaths = new Set();
            
            loras.forEach(lora => {
                const path = lora.path || lora.name;
                
                // 只有当路径完全相同时才认为是重复
                if (!seenPaths.has(path)) {
                    seenPaths.add(path);
                    uniqueLoras.push(lora);
                }
            });
            
            let loraList = `🎨 **可用LoRA列表：** (共${uniqueLoras.length}个`;
            if (uniqueLoras.length !== loras.length) {
                loraList += `，原始${loras.length}个已去重`;
            }
            loraList += `)\n\n`;
            
            uniqueLoras.forEach((lora, index) => {
                loraList += `${index + 1}. **${lora.name}**\n`;
                if (lora.alias && lora.alias !== lora.name) {
                    loraList += `   别名: \`${lora.alias}\`\n`;
                }
                if (lora.path) {
                    const fileName = lora.path.split(/[\\\/]/).pop();
                    loraList += `   文件: \`${fileName}\`\n`;
                }
                const hash = lora.metadata?.ss_sd_model_hash || lora.hash;
                if (hash) {
                    loraList += `   哈希: \`${hash.substring(0, 8)}...\`\n`;
                }
                loraList += `\n`;
            });
            
            loraList += `\n💡 **使用方法：**\n`;
            loraList += `在提示词中使用格式: \`<lora:LoRA名称:权重>\`\n`;
            loraList += `例如: \`{"prompt": "masterpiece, <lora:${uniqueLoras[0]?.name || 'lora_name'}:0.8>, best quality"}\`\n`;
            loraList += `权重范围通常为 0.1-1.5，推荐 0.6-1.0\n\n`;
            loraList += `📝 **注意**: 如果LoRA名称包含空格，请使用下划线替代，或用引号包围。`;
            
            return {
                content: [{
                    type: 'text',
                    text: loraList
                }]
            };
        }
        
        // 如果是综合信息请求
        if (lowerType.includes('all') || lowerType.includes('info') || lowerType.includes('信息') || lowerType.includes('全部')) {
            console.error('获取全部信息...');
            const [models, samplers, schedulers, loras, options] = await Promise.all([
                getModels(),
                getSamplers(), 
                getSchedulers(),
                getLoras(),
                getCurrentOptions()
            ]);
            
            // 对LoRA进行去重计算（基于路径）
            const uniqueLoraPaths = new Set();
            loras.forEach(lora => {
                const path = lora.path || lora.name;
                uniqueLoraPaths.add(path);
            });
            const uniqueLoraCount = uniqueLoraPaths.size;
            
            const currentModel = options.sd_model_checkpoint;
            const currentModelInfo = models.find(m => m.title === currentModel);
            
            let infoText = '🎯 **SD Forge 当前状态信息：**\n\n';
            infoText += `📍 **当前模型:** ${currentModelInfo?.model_name || currentModel}\n`;
            infoText += `📊 **可用模型数量:** ${models.length}\n`;
            infoText += `🎛️ **可用采样器数量:** ${samplers.length}\n`;
            infoText += `⚙️ **可用调度器数量:** ${schedulers.length}\n`;
            infoText += `🎨 **可用LoRA数量:** ${uniqueLoraCount} (原始${loras.length}个，已去重)\n\n`;
            
            infoText += `💡 **查看详细列表：**\n`;
            infoText += `• 模型列表: \`{"info": "models"}\`\n`;
            infoText += `• 采样器列表: \`{"info": "samplers"}\`\n`;
            infoText += `• 调度器列表: \`{"info": "schedulers"}\`\n`;
            infoText += `• LoRA列表: \`{"info": "loras"}\`\n\n`;
            
            infoText += `🔄 **功能支持:**\n`;
            infoText += `✅ 文生图 (Text-to-Image)\n`;
            infoText += `✅ 图生图 (Image-to-Image)\n`;
            infoText += `✅ 图片放大 (Upscaling)\n`;
            infoText += `✅ 模型切换\n`;
            infoText += `✅ LoRA支持\n`;
            infoText += `✅ 批量生成\n`;
            infoText += `✅ 高分辨率修复`;
            
            return {
                content: [{
                    type: 'text',
                    text: infoText
                }]
            };
        }
        
    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: `❌ 获取信息失败: ${error.message}\n\n请确认SD Forge服务器正在运行且API可访问。`
            }]
        };
    }
    
    return null;
}

async function main() {
    let inputString = '';
    try {
        // 1. 从 stdin 读取输入
        inputString = await new Promise((resolve) => {
            process.stdin.on('data', (chunk) => {
                inputString += chunk;
            });
            process.stdin.on('end', () => {
                resolve(inputString.trim());
            });
        });

        if (!inputString) {
            throw new Error('No input received from stdin.');
        }

        const args = JSON.parse(inputString);

        // 2. 检查是否是信息查询请求
        const infoResult = await handleInfoRequest(args);
        if (infoResult) {
            console.log(JSON.stringify({ status: "success", result: infoResult }));
            return;
        }

        // 3. 检查是否需要切换模型
        const modelToSwitch = getParam(args, ['model', 'checkpoint', 'sd_model_checkpoint', '模型', '模型切换']);
        if (modelToSwitch) {
            console.error(`切换模型到: ${modelToSwitch}`);
            try {
                await switchModel(modelToSwitch);
                const result = {
                    content: [{
                        type: 'text',
                        text: `✅ **模型切换成功！**\n\n已切换到模型: **${modelToSwitch}**\n\n现在可以使用新模型进行图片生成了。`
                    }]
                };
                console.log(JSON.stringify({ status: "success", result: result }));
                return;
            } catch (error) {
                const result = {
                    content: [{
                        type: 'text',
                        text: `❌ **模型切换失败！**\n\n错误: ${error.message}\n\n请确认模型名称正确，可以先使用 \`{"info": "models"}\` 查看可用模型列表。`
                    }]
                };
                console.log(JSON.stringify({ status: "success", result: result }));
                return;
            }
        }

        // 4. 正常的图片生成流程 - 构建 API 请求体
        const payload = {
            prompt: getParam(args, ['prompt', '正向提示词']),
            negative_prompt: getParam(args, ['negative_prompt', '负向提示词'], ''),
            width: parseInt(getParam(args, ['width', '宽度'], 1024)),
            height: parseInt(getParam(args, ['height', '高度'], 1024)),
            steps: parseInt(getParam(args, ['steps', '步数'], 20)),
            sampler_name: getParam(args, ['sampler_name', '采样器'], 'DPM++ 2M Karras'),
            cfg_scale: parseFloat(getParam(args, ['cfg_scale', 'CFG'], 7)),
            seed: parseInt(getParam(args, ['seed', '种子'], -1)),
        };

        if (!payload.prompt) {
            throw new Error("The 'prompt' parameter is required.");
        }

        // 从环境变量中读取认证信息
        const username = process.env.SD_FORGE_USERNAME;
        const password = process.env.SD_FORGE_PASSWORD;

        // 3. 从环境变量获取 API URL - 恢复原来的完整URL方式
        let apiUrl = process.env.SD_FORGE_API_URL;
        if (!apiUrl) {
            throw new Error('SD_FORGE_API_URL is not set in the environment.');
        }
        
        // 如果URL不包含具体端点，添加txt2img
        if (!apiUrl.includes('/sdapi/v1/')) {
            if (apiUrl.endsWith('/')) {
                apiUrl += 'sdapi/v1/txt2img';
            } else {
                apiUrl += '/sdapi/v1/txt2img';
            }
        }

        console.error(`使用API URL: ${apiUrl}`);
        console.error(`请求载荷: ${JSON.stringify(payload, null, 2)}`);

        // 4. 准备请求头
        const headers = {
            'Content-Type': 'application/json',
        };

        // 如果提供了用户名和密码，使用 Basic Auth
        if (username && password) {
            const auth = Buffer.from(`${username}:${password}`).toString('base64');
            headers['Authorization'] = `Basic ${auth}`;
            console.error('使用Basic Auth认证');
        } else {
            console.error('未设置认证信息');
        }

        // 5. 调用 SD Forge API
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
        });

        console.error(`响应状态: ${response.status}`);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`错误响应: ${errorBody}`);
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const base64Image = data.images && data.images[0];

        if (!base64Image) {
            console.error('API响应数据:', JSON.stringify(data, null, 2));
            throw new Error('No image data received from the API.');
        }

        // 6. 保存图片到本地文件
        const outputDir = process.env.SD_FORGE_OUTPUT_DIR || './output';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `sd_generated_${timestamp}.png`;
        const filePath = path.join(outputDir, fileName);
        
        // 确保输出目录存在
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // 将base64图片数据保存为文件
        const imageBuffer = Buffer.from(base64Image, 'base64');
        fs.writeFileSync(filePath, imageBuffer);

        console.error(`图片已保存: ${filePath}`);

        // 7. 构建成功的多模态返回结果
        const absolutePath = path.resolve(filePath);
        const webPath = `file:///${absolutePath.replace(/\\/g, '/')}`;
        const result = {
            content: [
                {
                    type: 'text',
                    text: `🎉 图像已成功生成！ 🎉

AI创作完成！

✨ 提示词 (Prompt): ${payload.prompt}
📏 尺寸: ${payload.width}×${payload.height}
⚙️ 参数: ${payload.steps}步 | ${payload.sampler_name} | CFG=${payload.cfg_scale}
📂 保存路径: ${fileName}
🌐 Web路径: ${webPath}

希望您对这张新生成的图片感到满意！`
                },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:image/png;base64,${base64Image}`
                    }
                },
                {
                    type: 'file_path',
                    file_path: webPath
                }
            ]
        };

        console.log(JSON.stringify({ status: "success", result: result }));

    } catch (e) {
        // 8. 构建失败的返回结果
        console.error(`错误详情: ${e.message}`);
        console.error(`错误堆栈: ${e.stack}`);
        
        const errorResult = {
            status: 'error',
            error: `An error occurred in SDForgeGen: ${e.message}
Stack: ${e.stack}
Input: ${inputString}`
        };
        console.log(JSON.stringify(errorResult));
        process.exit(1);
    }
}

main();
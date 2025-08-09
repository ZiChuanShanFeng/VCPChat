const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 测试SDForgeGen模型功能...\n');

async function testFunction(testName, testData) {
    console.log(`\n=== ${testName} ===`);
    console.log('测试参数:', JSON.stringify(testData, null, 2));
    
    return new Promise((resolve) => {
        const pluginPath = path.join(__dirname, 'SDForgeGen.js');
        const child = spawn('node', [pluginPath], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        child.stdin.write(JSON.stringify(testData));
        child.stdin.end();

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            console.log(`退出代码: ${code}`);
            
            if (stderr) {
                console.log('调试信息:', stderr);
            }
            
            if (stdout) {
                try {
                    const result = JSON.parse(stdout);
                    console.log('返回结果:', JSON.stringify(result, null, 2));
                    
                    if (result.status === 'success') {
                        console.log('✅ 测试成功！');
                    } else {
                        console.log('❌ 测试失败:', result.error);
                    }
                } catch (e) {
                    console.log('原始输出:', stdout);
                    console.log('JSON解析错误:', e.message);
                }
            }
            
            resolve();
        });
    });
}

async function runTests() {
    // 测试1: 获取系统信息
    await testFunction('获取系统信息', {
        info: 'all'
    });
    
    // 测试2: 获取模型列表
    await testFunction('获取模型列表', {
        info: 'models'
    });
    
    // 测试3: 获取采样器列表
    await testFunction('获取采样器列表', {
        info: 'samplers'
    });
    
    // 测试4: 获取调度器列表
    await testFunction('获取调度器列表', {
        info: 'schedulers'
    });
    
    console.log('\n🎯 所有测试完成！');
    console.log('\n如果以上测试都成功，你现在可以：');
    console.log('• 查看可用模型: {"info": "models"}');
    console.log('• 切换模型: {"model": "模型名称"}');
    console.log('• 查看采样器: {"info": "samplers"}');
    console.log('• 正常生成图片并自动使用当前模型');
}

runTests().catch(console.error);
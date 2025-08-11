const https = require('https'); // Using https for broader compatibility, can be replaced with 'fetch' in Node.js 18+

// --- Configuration Loading ---
const AI_API_KEY = process.env.AI_API_KEY;
const AI_API_ENDPOINT = new URL(process.env.AI_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions');
const AI_MODEL_NAME = process.env.AI_MODEL_NAME || 'gpt-3.5-turbo';
const CHUNK_SIZE_WORDS = parseInt(process.env.CHUNK_SIZE_WORDS || '150', 10);
const OVERLAP_WORDS = parseInt(process.env.OVERLAP_WORDS || '20', 10);

if (!AI_API_KEY) {
    console.error(JSON.stringify({ status: "error", error: "AI_API_KEY is not configured in config.env." }));
    process.exit(1);
}

// --- Helper Functions ---

/**
 * Splits text into chunks of roughly a certain word count with overlap.
 * @param {string} text The input text.
 * @param {number} chunkSizeWords The target word count for each chunk.
 * @param {number} overlapWords The number of overlapping words between chunks.
 * @returns {string[]} An array of text chunks.
 */
function splitTextIntoChunks(text, chunkSizeWords, overlapWords) {
    const words = text.split(/\s+/);
    const chunks = [];
    let startIndex = 0;

    while (startIndex < words.length) {
        const endIndex = Math.min(startIndex + chunkSizeWords, words.length);
        chunks.push(words.slice(startIndex, endIndex).join(' '));
        startIndex += (chunkSizeWords - overlapWords);
        if (startIndex >= words.length - overlapWords && startIndex < words.length) {
            // Add the last remaining part as a final chunk
            chunks.push(words.slice(startIndex).join(' '));
            break;
        }
    }
    return chunks.filter(chunk => chunk.trim().length > 0);
}

/**
 * Calls the AI API to check a single text chunk.
 * @param {string} chunk The text chunk to analyze.
 * @returns {Promise<object>} A promise that resolves to the AI's analysis result.
 */
function callAIApi(chunk) {
    return new Promise((resolve, reject) => {
        const prompt = `
请仔细分析以下文本片段，并判断其原创性。你的任务是识别出这段文字是否可能是从网络、书籍、文章或其他现有来源中复制、转述或高度借鉴的。

请从以下几个方面进行分析，并以JSON格式返回结果：
1.  "originality_score": 一个0到100之间的整数，表示原创性评分（100表示完全原创，0表示几乎可以肯定是抄袭）。
2.  "assessment": 一个字符串，可以是 "高度相似 (需重点关注)", "中度相似 (建议审查)", 或 "低度相似/可能原创"。
3.  "reasoning": 详细的推理过程，解释为什么给出这个评分。例如，指出这是否是通用知识、是否有独特的个人观点、语言风格是否常见等。
4.  "suggested_search_query": 如果认为内容非原创，请提供一个或多个适合用于在搜索引擎中查找相似内容的精确查询短语。

**需要分析的文本片段：**
"""
${chunk}
"""

**请严格按照以下JSON格式返回，不要包含任何其他解释性文字：**
{
  "originality_score": <integer>,
  "assessment": "<string>",
  "reasoning": "<string>",
  "suggested_search_query": "<string or null>"
}
        `;

        const payload = JSON.stringify({
            model: AI_MODEL_NAME,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2, // Lower temperature for more deterministic output
            response_format: { type: "json_object" } // Request JSON output if supported by the model
        });

        const options = {
            hostname: AI_API_ENDPOINT.hostname,
            port: AI_API_ENDPOINT.port || 443,
            path: AI_API_ENDPOINT.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`,
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 30000 // 30 seconds timeout per API call
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const response = JSON.parse(data);
                        const content = response.choices?.[0]?.message?.content;
                        if (content) {
                            resolve(JSON.parse(content)); // Parse the JSON string from the AI
                        } else {
                            reject(new Error('AI API returned an empty or malformed response.'));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse AI API response: ${e.message}. Response: ${data}`));
                    }
                } else {
                    reject(new Error(`AI API request failed with status ${res.statusCode}. Response: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(new Error(`Network error during AI API call: ${e.message}`)));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('AI API request timed out.'));
        });

        req.write(payload);
        req.end();
    });
}

// --- Main Logic ---
async function main() {
    let inputData = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
        inputData += chunk;
    }

    let requestParams;
    try {
        requestParams = JSON.parse(inputData);
    } catch (e) {
        console.error(JSON.stringify({ status: "error", error: "Invalid JSON input received." }));
        process.exit(1);
    }

    const { textToCheck } = requestParams;

    if (!textToCheck || typeof textToCheck !== 'string' || textToCheck.trim().length === 0) {
        console.error(JSON.stringify({ status: "error", error: "Input 'textToCheck' is missing or empty." }));
        process.exit(1);
    }

    try {
        console.error(`[AIPlagiarismChecker] Starting analysis. Text length: ${textToCheck.length} chars.`);
        const textChunks = splitTextIntoChunks(textToCheck, CHUNK_SIZE_WORDS, OVERLAP_WORDS);
        console.error(`[AIPlagiarismChecker] Text split into ${textChunks.length} chunks.`);

        const results = [];
        for (let i = 0; i < textChunks.length; i++) {
            const chunk = textChunks[i];
            console.error(`[AIPlagiarismChecker] Analyzing chunk ${i + 1}/${textChunks.length}...`);
            try {
                const analysis = await callAIApi(chunk);
                results.push({
                    chunkIndex: i + 1,
                    originalText: chunk.substring(0, 100) + '...', // Show a preview
                    analysis: analysis
                });
            } catch (apiError) {
                console.error(`[AIPlagiarismChecker] Error analyzing chunk ${i + 1}: ${apiError.message}`);
                results.push({
                    chunkIndex: i + 1,
                    originalText: chunk.substring(0, 100) + '...',
                    error: apiError.message
                });
            }
        }

        // Generate Markdown Report
        let report = `# AI 文本查重报告\n\n`;
        report += `**总文本块数**: ${textChunks.length}\n`;
        report += `**分析完成时间**: ${new Date().toUTCString()}\n`;
        report += `**使用模型**: ${AI_MODEL_NAME}\n\n`;
        report += `---\n\n`;

        // Summary
        const summary = { "高度相似 (需重点关注)": 0, "中度相似 (建议审查)": 0, "低度相似/可能原创": 0, "分析失败": 0 };
        results.forEach(r => {
            if (r.error) summary["分析失败"]++;
            else summary[r.analysis.assessment] = (summary[r.analysis.assessment] || 0) + 1;
        });
        report += `## 查重结果摘要\n\n`;
        for (const [key, value] of Object.entries(summary)) {
            report += `- **${key}**: ${value} 块\n`;
        }
        report += `\n---\n\n`;

        // Detailed Results
        report += `## 详细分析结果\n\n`;
        results.forEach(result => {
            report += `### 文本块 ${result.chunkIndex} (原文预览: "${result.originalText}")\n`;
            if (result.error) {
                report += `- **分析状态**: 失败\n`;
                report += `- **错误信息**: ${result.error}\n\n`;
            } else {
                const analysis = result.analysis;
                report += `- **AI 评估**: ${analysis.assessment}\n`;
                report += `- **原创性评分**: ${analysis.originality_score}/100\n`;
                report += `- **AI 分析**: ${analysis.reasoning}\n`;
                if (analysis.suggested_search_query) {
                    report += `- **建议查询**: "${analysis.suggested_search_query}"\n`;
                }
                report += `\n`;
            }
        });

        const output = {
            status: "success",
            result: {
                report: report,
                summary: summary
            }
        };
        console.log(JSON.stringify(output));
        process.exit(0);

    } catch (error) {
        console.error(JSON.stringify({ status: "error", error: "An unexpected error occurred during the plagiarism check.", details: error.message }));
        process.exit(1);
    }
}

main();
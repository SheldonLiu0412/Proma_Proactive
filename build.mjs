#!/usr/bin/env node

/**
 * Proma_Proactive Skill Builder
 *
 * 根据配置文件动态拼接组件生成目标文件。
 *
 * 用法：
 *   node build.mjs              # 构建所有 skill-configs/ 下的配置
 *   node build.mjs dream-daily  # 只构建指定配置
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COMPONENTS_DIR = join(__dirname, 'components');
const SKILLS_DIR = join(__dirname, 'skills');
const CONFIGS_DIR = join(__dirname, 'skill-configs');

/**
 * 读取组件内容。组件名可以包含子目录，如 "guide/profile"。
 */
function readComponent(name) {
  const path = join(COMPONENTS_DIR, `${name}.md`);
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch (err) {
    throw new Error(`Failed to read component: ${name} (${path})`);
  }
}

/**
 * 判断组件是否为 head 或 footer（不参与阶段编号）
 */
function isStructuralComponent(name) {
  const basename = name.split('/').pop();
  return basename === 'head' || basename.startsWith('footer-');
}

/**
 * 给组件内容的第一个 `## ` 标题加上阶段序号前缀
 * "## 原标题" → "## 阶段 N：原标题"
 */
function addPhaseNumber(content, n) {
  return content.replace(/^(##\s+)(.+)$/m, `$1阶段 ${n}：$2`);
}

/**
 * 构建目标文件
 */
function buildSkill(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const {
    name,
    version,
    description,
    components,
    output,          // 可选：自定义输出路径（相对于项目根目录）
    hasFrontmatter = true,  // 默认生成 frontmatter
    numbered = false,       // 是否给 body 组件加阶段序号
  } = config;

  // 确定输出路径
  let outputPath;
  if (output) {
    outputPath = join(__dirname, output);
  } else {
    outputPath = join(SKILLS_DIR, name, 'SKILL.md');
  }

  // 确保输出目录存在
  mkdirSync(dirname(outputPath), { recursive: true });

  // 拼接各组件
  let phaseCounter = 0;
  const sections = components.map(componentName => {
    let content = readComponent(componentName);

    if (numbered && !isStructuralComponent(componentName)) {
      phaseCounter++;
      content = addPhaseNumber(content, phaseCounter);
    }

    return content;
  });

  // 组装完整内容
  let parts = [];

  if (hasFrontmatter) {
    parts.push(`---
name: ${name}
version: "${version}"
description: "${description}"
---`);
  }

  parts.push(...sections);

  const fullContent = parts.join('\n\n') + '\n';

  writeFileSync(outputPath, fullContent, 'utf-8');

  return outputPath;
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const configFiles = readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
    console.log(`Building ${configFiles.length} configs...\n`);

    for (const configFile of configFiles) {
      const configPath = join(CONFIGS_DIR, configFile);
      try {
        const outputPath = buildSkill(configPath);
        console.log(`✓ Built: ${outputPath}`);
      } catch (err) {
        console.error(`✗ Failed to build ${configFile}:`, err.message);
      }
    }

    console.log('\nAll done!');
  } else {
    const skillName = args[0];
    const configPath = join(CONFIGS_DIR, `${skillName}.json`);

    try {
      const outputPath = buildSkill(configPath);
      console.log(`✓ Built: ${outputPath}`);
    } catch (err) {
      console.error(`✗ Failed to build ${skillName}:`, err.message);
      process.exit(1);
    }
  }
}

main();

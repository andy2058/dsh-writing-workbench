/**
 * 老欧写作工作台 · 宿主端（Node 半）
 *
 * 唯一职责：把 templates/ 里的六阶段提示词 + 编排提示词注册成 7 个 agent skill，
 * 让模型在会话里能自动识别并调用（不用打开工作台）。
 *
 * 浏览器半（工作台 UI）在 lib/client.js，由 dsh.client 声明加载。
 */
import { SKILLS } from './skill-manifest.js'

export const inject = ['skills']

export function apply(ctx) {
  for (const skill of SKILLS) {
    ctx.effect(
      () => ctx.skills.register(skill),
      `writing-workbench:skill:${skill.name}`,
    )
  }
}

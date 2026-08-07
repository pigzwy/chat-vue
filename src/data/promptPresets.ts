export interface PromptPreset {
  label: string
  icon: string
  color: string
  prompt: string
}

export const homeQuickPrompts: PromptPreset[] = [
  { label: '帮我总结这份资料', icon: 'i-lucide-file-text', color: 'text-blue-500', prompt: '帮我总结这份资料' },
  { label: '写一份产品方案', icon: 'i-lucide-clipboard-list', color: 'text-amber-500', prompt: '写一份产品方案' },
  { label: '优化这段提示词', icon: 'i-lucide-sparkles', color: 'text-violet-500', prompt: '优化这段提示词' },
  { label: '生成一周学习计划', icon: 'i-lucide-calendar-check', color: 'text-emerald-500', prompt: '生成一周学习计划' },
  { label: '帮我分析图片内容', icon: 'i-lucide-image', color: 'text-pink-500', prompt: '帮我分析图片内容' },
  { label: '写一封商务邮件', icon: 'i-lucide-mail', color: 'text-blue-500', prompt: '写一封商务邮件' },
  { label: '整理成表格对比', icon: 'i-lucide-table', color: 'text-amber-500', prompt: '整理成表格对比' },
  { label: '把内容翻译成英文', icon: 'i-lucide-languages', color: 'text-violet-500', prompt: '把内容翻译成英文' },
  { label: '生成会议纪要', icon: 'i-lucide-notebook-pen', color: 'text-emerald-500', prompt: '生成会议纪要' },
  { label: '提炼行动清单', icon: 'i-lucide-check-square', color: 'text-pink-500', prompt: '提炼行动清单' }
]

export const chatFollowupPresets: PromptPreset[] = [
  { label: '总结重点', icon: 'i-lucide-list-check', color: 'text-blue-500', prompt: '请帮我总结上面的重点，并按条目列出可执行建议。' },
  { label: '润色表达', icon: 'i-lucide-pen-line', color: 'text-amber-500', prompt: '请帮我把这段内容润色得更专业、更清晰。' },
  { label: '深入分析', icon: 'i-lucide-brain', color: 'text-violet-500', prompt: '请从背景、问题、原因、风险和下一步建议几个角度深入分析。' },
  { label: '生成表格', icon: 'i-lucide-table', color: 'text-emerald-500', prompt: '请把这些信息整理成对比表格，并补充简短结论。' }
]

export const imagePromptPresets: PromptPreset[] = [
  {
    label: '赛博朋克城市',
    icon: 'i-lucide-sparkles',
    color: 'text-violet-500',
    prompt: '一座充满霓虹灯和飞行器的赛博朋克风格科幻城市，夜晚，雨后街道，8k，高细节，虚幻引擎5渲染'
  },
  {
    label: '动漫插画',
    icon: 'i-lucide-image',
    color: 'text-pink-500',
    prompt: '一个可爱的二次元动漫少女，站在落日余晖的向日葵花海中，微风吹过，新海诚画风，壁纸级别'
  },
  {
    label: '皮克斯 3D',
    icon: 'i-lucide-gamepad-2',
    color: 'text-blue-500',
    prompt: '皮克斯 3D 动画风格，可爱的角色，柔和灯光，丰富表情，电影级构图，高质量渲染'
  },
  {
    label: '水彩风景',
    icon: 'i-lucide-palette',
    color: 'text-emerald-500',
    prompt: '清新的水彩风景插画，远山、湖泊、晨雾和柔和阳光，纸张纹理，干净留白'
  },
  {
    label: '写实摄影',
    icon: 'i-lucide-camera',
    color: 'text-amber-500',
    prompt: '写实摄影风格，自然光，浅景深，细腻质感，专业商业摄影构图，高清细节'
  }
]

export const videoPromptPresets: PromptPreset[] = [
  {
    label: '延时城市',
    icon: 'i-lucide-building-2',
    color: 'text-blue-500',
    prompt: '城市天际线延时摄影，云层快速流动，日落到夜晚的光影变化，霓虹灯渐次亮起，电影感调色'
  },
  {
    label: '自然风光',
    icon: 'i-lucide-mountain',
    color: 'text-emerald-500',
    prompt: '无人机航拍雪山湖泊，镜头缓缓推进，湖面倒影清晰，晨雾缭绕，史诗感配乐氛围'
  },
  {
    label: '动画短片',
    icon: 'i-lucide-clapperboard',
    color: 'text-violet-500',
    prompt: '皮克斯风格 3D 动画，一只小机器人在花园里追逐蝴蝶，镜头跟随移动，柔和光线，温馨愉快'
  },
  {
    label: '产品展示',
    icon: 'i-lucide-package',
    color: 'text-amber-500',
    prompt: '产品广告运镜，物体在纯色背景前缓慢旋转，柔和棚拍灯光，微距细节特写，高级质感'
  },
  {
    label: '让画面动起来',
    icon: 'i-lucide-wand-sparkles',
    color: 'text-pink-500',
    prompt: '让画面自然地动起来，人物和景物保持原有风格，加入轻微的镜头推移和环境动态'
  }
]

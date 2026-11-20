import { formatTagPt } from '../../core/promptTagsPt'
import type { PromptItem } from '../../types/promptEngine'

/**
 * Gera um título legível a partir dos atributos semânticos do prompt,
 * evitando exibir nomes de arquivo UUID na interface do lab.
 */
export function getPromptSemanticTitle(item: PromptItem): string {
  const candidateTags: string[] = []
  const axes = [
    item.attributes.sujeito,
    item.attributes.estilo,
    item.attributes.cenario,
    item.attributes.luz,
    item.attributes.camera,
  ]

  for (const slot of axes) {
    for (const tag of slot.tags) {
      if (!tag || candidateTags.includes(tag)) continue
      candidateTags.push(tag)
      if (candidateTags.length >= 3) break
    }
    if (candidateTags.length >= 3) break
  }

  if (candidateTags.length > 0) {
    return candidateTags.map((t) => formatTagPt(t)).join(' · ')
  }

  return `${item.project} · ${item.attributes.estrutura.kernelDialect}`
}

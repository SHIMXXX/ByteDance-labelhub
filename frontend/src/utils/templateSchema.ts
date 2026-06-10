import type { TemplateComponent, TemplateSchema } from '../types/domain'

function getDefaultPaneForComponentType(type: TemplateComponent['type']): 'source' | 'answer' {
  if (type === 'show_item' || type === 'compare_panel' || type === 'rich_text' || type.startsWith('field_')) {
    return 'source'
  }

  return 'answer'
}

export function inferTemplateComponentPane(component: TemplateComponent): 'source' | 'answer' {
  if (component.pane === 'source' || component.pane === 'answer') {
    return component.pane
  }

  if (component.type === 'group') {
    const childPanes = (component.children ?? []).map(inferTemplateComponentPane)
    if (childPanes.length > 0 && childPanes.every((pane) => pane === 'source')) {
      return 'source'
    }
    return 'answer'
  }

  if (component.type === 'tab_container') {
    const childPanes = (component.tabs ?? []).flatMap((tab) => tab.children.map(inferTemplateComponentPane))
    if (childPanes.length > 0 && childPanes.every((pane) => pane === 'source')) {
      return 'source'
    }
    return 'answer'
  }

  return getDefaultPaneForComponentType(component.type)
}

export function extractTemplateSchemaComponents(schema: TemplateSchema): TemplateComponent[] {
  if (Array.isArray(schema)) {
    return schema
  }

  const legacySchema = schema as unknown as { components?: TemplateComponent[] }
  if (Array.isArray(legacySchema.components)) {
    return legacySchema.components
  }

  return [...schema.sourceView.components, ...schema.answerView.components]
}

function projectTemplateComponentsToPane(
  components: TemplateComponent[],
  pane: 'source' | 'answer',
): TemplateComponent[] {
  return components.flatMap((component) => {
    if (component.type === 'group') {
      const children = projectTemplateComponentsToPane(component.children ?? [], pane)
      return children.length > 0 ? [{ ...component, children }] : []
    }

    if (component.type === 'tab_container') {
      const tabs = (component.tabs ?? [])
        .map((tab) => ({
          ...tab,
          children: projectTemplateComponentsToPane(tab.children, pane),
        }))
        .filter((tab) => tab.children.length > 0)

      return tabs.length > 0 ? [{ ...component, tabs }] : []
    }

    if (component.type === 'compare_panel') {
      const children_left = projectTemplateComponentsToPane(component.children_left ?? [], pane)
      const children_right = projectTemplateComponentsToPane(component.children_right ?? [], pane)

      if (children_left.length > 0 || children_right.length > 0) {
        return [{ ...component, children_left, children_right }]
      }
    }

    return inferTemplateComponentPane(component) === pane ? [component] : []
  })
}

export function splitTemplateSchemaByPane(schema: TemplateSchema) {
  if (Array.isArray(schema)) {
    return {
      sourceComponents: projectTemplateComponentsToPane(schema, 'source'),
      answerComponents: projectTemplateComponentsToPane(schema, 'answer'),
    }
  }

  const legacySchema = schema as unknown as { components?: TemplateComponent[] }
  if (Array.isArray(legacySchema.components)) {
    return {
      sourceComponents: projectTemplateComponentsToPane(legacySchema.components, 'source'),
      answerComponents: projectTemplateComponentsToPane(legacySchema.components, 'answer'),
    }
  }

  return {
    sourceComponents: projectTemplateComponentsToPane(schema.sourceView.components, 'source'),
    answerComponents: projectTemplateComponentsToPane(schema.answerView.components, 'answer'),
  }
}

export function projectTemplateSchemaToPane(schema: TemplateSchema, pane: 'source' | 'answer'): TemplateSchema {
  if (Array.isArray(schema)) {
    return projectTemplateComponentsToPane(schema, pane)
  }

  const legacySchema = schema as unknown as { components?: TemplateComponent[] }
  if (Array.isArray(legacySchema.components)) {
    return projectTemplateComponentsToPane(legacySchema.components, pane)
  }

  return {
    ...schema,
    sourceView: { components: pane === 'source' ? projectTemplateComponentsToPane(schema.sourceView.components, 'source') : [] },
    answerView: { components: pane === 'answer' ? projectTemplateComponentsToPane(schema.answerView.components, 'answer') : [] },
  }
}

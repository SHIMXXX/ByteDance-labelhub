import type { TemplateComponent, TemplateSchema, TemplateValidationRule, TemplateVisibilityRule } from '../../types/domain'
import { extractTemplateSchemaComponents } from '../../utils/templateSchema'

function extractComponents(schema: TemplateSchema): TemplateComponent[] {
  return extractTemplateSchemaComponents(schema)
}

function flattenComponents(components: TemplateComponent[]): TemplateComponent[] {
  return components.flatMap((component) => {
    if (component.type === 'group') {
      return flattenComponents(component.children ?? [])
    }
    if (component.type === 'tab_container') {
      return (component.tabs ?? []).flatMap((tab) => flattenComponents(tab.children ?? []))
    }
    return [component]
  })
}

function isEmptyValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length === 0
  }

  return value === '' || value === null || value === undefined
}

function getRuleValue(values: Record<string, unknown>, field: string) {
  if (field in values) {
    return values[field]
  }

  return field.split('.').reduce<unknown>((current, segment) => {
    if (!segment || current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    return (current as Record<string, unknown>)[segment]
  }, values)
}

export function evaluateVisibleWhen(rules: TemplateVisibilityRule[] = [], answers: Record<string, unknown>): boolean {
  return rules.every((rule) => {
    const value = getRuleValue(answers, rule.field)
    if (rule.operator === 'eq') return value === rule.value
    if (rule.operator === 'neq') return value !== rule.value
    if (rule.operator === 'not_empty') return !isEmptyValue(value)
    if (rule.operator === 'includes') return Array.isArray(value) && value.includes(rule.value)
    return true
  })
}

export function getActiveComponents(schema: TemplateSchema, answers: Record<string, unknown>) {
  return flattenComponents(extractComponents(schema)).filter((component) => evaluateVisibleWhen(component.visibleWhen, answers))
}

function validateRule(component: TemplateComponent, rule: TemplateValidationRule, answers: Record<string, unknown>): string | null {
  const value = answers[component.field]

  if (rule.type === 'json_valid' && typeof value === 'string' && value.trim()) {
    try {
      JSON.parse(value)
    } catch {
      return `${component.label} 必须是合法 JSON`
    }
  }

  if (rule.type === 'required_if' && evaluateVisibleWhen([{ field: rule.field, operator: rule.operator, value: rule.value }], answers)) {
    if (isEmptyValue(value)) {
      return `${component.label}不能为空`
    }
  }

  if (rule.type === 'min_selected') {
    const values = Array.isArray(value) ? value : []
    if (values.length < rule.value) {
      return `${component.label}至少选择 ${rule.value} 项`
    }
  }

  if (rule.type === 'min_length') {
    const textValue = String(value ?? '').trim()
    if (textValue.length < rule.value) {
      return `${component.label}至少填写 ${rule.value} 个字符`
    }
  }

  if (rule.type === 'equals_if' && evaluateVisibleWhen([{ field: rule.field, operator: rule.operator, value: rule.value }], answers)) {
    if (String(value ?? '') !== rule.expectedValue) {
      return `${component.label}必须为 ${rule.expectedValue}`
    }
  }

  if (rule.type === 'not_equals_if' && evaluateVisibleWhen([{ field: rule.field, operator: rule.operator, value: rule.value }], answers)) {
    if (String(value ?? '') === rule.expectedValue) {
      return `${component.label}不能为 ${rule.expectedValue}`
    }
  }

  return null
}

export function validateAnswers(schema: TemplateSchema, answers: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const component of getActiveComponents(schema, answers)) {
    for (const rule of component.validationRules ?? []) {
      const error = validateRule(component, rule, answers)
      if (error) {
        errors[component.field] = error
      }
    }
  }
  return errors
}

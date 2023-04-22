declare module '@conjurelabs/dot-template' {
  export type ValueMutator = (value: unknown, templateArgs: Record<string, unknown>, ...additionalArgs: unknown[]) => unknown
  export type ObjectMutator = (values: Record<string, unknown>, type: 'applied' | 'logged', ...additionalArgs: unknown[]) => Record<string, unknown>

  
  export interface Handler {
    expression: RegExp | typeof standardTemplate
    valueMutator: Mutator
    valuesObjectMutator: ObjectMutator
    logMutator: Mutator
  }
}

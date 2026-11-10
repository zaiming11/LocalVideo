export function sourceIdentity(source, live = false) {
  return JSON.stringify(live ? ['live', source.url || source.name] : ['site', source.key || source.api || source.name])
}
export function rememberedOption(options, identity) {
  return options.find(option => option.identity === identity) || options[0] || null
}
export function readSelections(value) {
  const records = input => input && typeof input === 'object' && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input).filter(([, selected]) => typeof selected === 'string')) : {}
  return { warehouses: records(value?.warehouses), sources: records(value?.sources) }
}

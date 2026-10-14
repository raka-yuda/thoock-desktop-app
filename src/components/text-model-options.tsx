import { textModels, type TextProvider } from "../lib/text-models";

export function TextModelOptions({
  provider,
  value,
}: {
  provider: TextProvider;
  value: string;
}) {
  const models = textModels[provider];
  return (
    <>
      {value && !models.some((model) => model.id === value) && (
        <option value={value}>{value} · Saved model</option>
      )}
      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name} · {model.id}
          {model.availability ? ` · ${model.availability}` : ""}
        </option>
      ))}
    </>
  );
}

async function createOpenAIResponse({ prompt, schemaName, schema, model }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt");
  }

  const body = {
    model: model || process.env.OPENAI_MODEL || "gpt-4.1",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        schema,
        strict: true
      }
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API Fehler: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.output?.[0]?.content?.[0];
  const text = content?.text;
  if (!text) {
    throw new Error("Keine strukturierte Ausgabe von OpenAI erhalten");
  }

  return JSON.parse(text);
}

module.exports = {
  createOpenAIResponse
};

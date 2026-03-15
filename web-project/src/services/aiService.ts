import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
};

export interface StyleReference {
  image: string;
  prompt: string;
}

export async function editImage(
  baseImageBase64: string,
  mainPrompt: string,
  styleReferences: StyleReference[] = []
): Promise<string> {
  const ai = getAI();
  
  const cleanBase64 = (str: string) => str.includes(",") ? str.split(",")[1] : str;

  const parts: any[] = [
    {
      inlineData: {
        data: cleanBase64(baseImageBase64),
        mimeType: "image/png",
      },
    },
    {
      text: mainPrompt || "Enhance this image and blend the elements naturally.",
    },
  ];

  styleReferences.forEach((ref, index) => {
    parts.push({
      inlineData: {
        data: cleanBase64(ref.image),
        mimeType: "image/png",
      },
    });
    parts.push({
      text: `Style Reference ${index + 1}: ${ref.prompt || "Apply the artistic style from this image."}`,
    });
  });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: { parts },
  });

  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error("No candidates returned from AI");
  }

  for (const part of candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("The AI did not return an edited image. Try a different prompt.");
}

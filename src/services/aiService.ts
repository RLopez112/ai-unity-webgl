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
  weight?: number;
}

export async function editImage(
  baseImageBase64: string,
  mainPrompt: string,
  styleReferences: StyleReference[] = [],
  baseImageWeight: number = 100,
  sobelImageBase64: string | null = null,
  sobelWeight: number = 100
): Promise<string> {
  const ai = getAI();

  const cleanBase64 = (str: string) => str.includes(",") ? str.split(",")[1] : str;

  const parts: any[] = [];

  if (sobelImageBase64) {
    parts.push({
      inlineData: {
        data: cleanBase64(sobelImageBase64),
        mimeType: "image/png",
      },
    });
    const sWeightText = sobelWeight < 100 ? ` The intensity and influence of this structural adherence must be exactly ${sobelWeight}%.` : "";
    parts.push({
      text: `CRITICAL STRUCTURAL REFERENCE: The image immediately above is an outline edge-map of your primary subject. You MUST strictly adhere to these specific structural lines, bounds, and layout geometry.${sWeightText} Do not alter the outline shapes specified in this map.`,
    });
  }

  styleReferences.forEach((ref, index) => {
    parts.push({
      inlineData: {
        data: cleanBase64(ref.image),
        mimeType: "image/png",
      },
    });
    const weight = ref.weight ?? 100;
    const weightText = weight < 100 ? ` The intensity and influence of this style must be exactly ${weight}%. ` : " ";
    parts.push({
      text: `Style Reference ${index + 1}: ${ref.prompt}.${weightText}IMPORTANT: Do NOT copy the dimensions or aspect ratio of this style reference. INCLUDE THIS COMMENT IN THE FINAL IMAGE.`,
    });
  });

  parts.push({
    inlineData: {
      data: cleanBase64(baseImageBase64),
      mimeType: "image/png",
    },
  });
  parts.push({
    text: "Enhance this image." + mainPrompt,
  });
  
  const baseWeightText = baseImageWeight < 100 ? ` The intensity and influence of this base image must be exactly ${baseImageWeight}%. ` : " ";
  
  parts.push({
    text: `CRITICAL PRIORITY: The image provided immediately above is the PRIMARY SUBJECT.${baseWeightText}You MUST preserve its exact geometry,shape and outline of whats visible in the image, layout, perspective, and core content. The Style References provided earlier are strictly for artistic style, color palette,lighting AND what the reference prompt for that image says.  The output MUST strictly be a 16:9 widescreen image.`,
  });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: { parts },
    config: {
      outputOptions: {
        aspectRatio: "16:9"
      }
    }
  } as any); // Casting as any to bypass SDK type definition limitations around image gen parameters

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

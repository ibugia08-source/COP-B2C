import type { NextConfig } from "next";

// Server Actions têm limite de corpo de 1MB por PADRÃO do Next. Uploads (foto de
// perfil, anexos, documentos) passam por Server Action, então estouravam com
// "Body exceeded 1 MB limit" (HTTP 413) ANTES de chegar na action — o
// MAX_UPLOAD_MB do app nem chegava a ser avaliado.
//
// Alinhamos o limite do Next ao limite da aplicação (lib/storage: MAX_UPLOAD_MB,
// default 25MB) + 1MB de folga para o overhead do multipart (boundaries, headers
// e metadados das partes), conforme recomendado na doc do Next.
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB) || 25;

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: `${maxUploadMb + 1}mb`,
    },
  },
};

export default nextConfig;

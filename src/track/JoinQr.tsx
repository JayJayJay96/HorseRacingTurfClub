import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export function JoinQr({ url }: { url: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 280, margin: 1 }).then(setSrc);
  }, [url]);
  return src ? <img src={src} width={280} height={280} alt={`QR code to join: ${url}`} /> : null;
}

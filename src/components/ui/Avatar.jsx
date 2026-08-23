import { useEffect, useState } from 'react';

export default function Avatar({ uuid, className, alt = '' }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const api = window.native?.accounts;
    if (!api) {
      // Fallback for browser testing
      setSrc(`https://mc-heads.net/avatar/${uuid || 'MHF_Steve'}/60`);
      return;
    }

    let active = true;
    api.getAvatar(uuid).then((localSrc) => {
      if (active) setSrc(localSrc);
    }).catch(() => {
      if (active) setSrc(`https://mc-heads.net/avatar/${uuid || 'MHF_Steve'}/60`);
    });

    return () => {
      active = false;
    };
  }, [uuid]);

  if (!src) {
    return <div className={`${className} avatar-skeleton`} />;
  }

  return <img className={className} src={src} alt={alt} />;
}

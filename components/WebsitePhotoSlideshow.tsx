"use client";

import { useEffect, useState } from "react";

export function WebsitePhotoSlideshow({ photos, businessName, startAt = 0 }: { photos: string[]; businessName: string; startAt?: number }) {
  const [index, setIndex] = useState(() => photos.length ? startAt % photos.length : 0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (photos.length < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % photos.length), 5500);
    return () => window.clearInterval(timer);
  }, [paused, photos.length, reducedMotion]);
  if (!photos.length) return null;
  return <div className="business-site-photo-slideshow" role="region" aria-roledescription="carousel" aria-label={`${businessName} photo gallery`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <div className="business-site-photo-track" style={{ transform: `translateX(-${index * 100}%)` }}>
      {photos.map((url, photoIndex) => <img src={url} alt={`${businessName} service photo ${photoIndex + 1}`} loading={photoIndex === index ? "eager" : "lazy"} key={`${url}-${photoIndex}`}/>) }
    </div>
    {photos.length > 1 && <nav aria-label="Choose website photo">{photos.map((_, photoIndex) => <button type="button" className={index === photoIndex ? "active" : ""} aria-label={`Show photo ${photoIndex + 1}`} aria-current={index === photoIndex ? "true" : undefined} onClick={() => setIndex(photoIndex)} key={photoIndex}/>)}</nav>}
  </div>;
}

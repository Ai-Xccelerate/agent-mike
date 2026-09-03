"use client";
import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import type { SwiperOptions } from "swiper/types";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

interface CarouselProps {
  slides: React.ReactNode[];
  slidesPerView?: number;
  spaceBetween?: number;
  navigation?: boolean;
  pagination?: boolean;
  loop?: boolean;
  breakpoints?: SwiperOptions["breakpoints"];
  className?: string;
}

const Carousel: React.FC<CarouselProps> = ({
  slides,
  slidesPerView = 1,
  spaceBetween = 16,
  navigation = false,
  pagination = false,
  loop = true,
  breakpoints,
  className = "",
}) => {
  const modules = [];
  if (navigation) modules.push(Navigation);
  if (pagination) modules.push(Pagination);

  return (
    <div className={`aix-carousel w-full max-w-full overflow-hidden ${className}`}>
      <Swiper
        modules={modules}
        slidesPerView={slidesPerView}
        spaceBetween={spaceBetween}
        navigation={navigation}
        pagination={pagination ? { clickable: true } : false}
        loop={loop}
        breakpoints={breakpoints}
      >
        {slides.map((slide, index) => (
          <SwiperSlide key={index}>{slide}</SwiperSlide>
        ))}
      </Swiper>
      <style jsx global>{`
        .aix-carousel .swiper-button-next,
        .aix-carousel .swiper-button-prev {
          color: var(--color-brand-500);
          --swiper-navigation-size: 28px;
        }
        .aix-carousel .swiper-button-next:focus-visible,
        .aix-carousel .swiper-button-prev:focus-visible {
          outline: 2px solid rgba(244, 121, 32, 0.5);
          outline-offset: 2px;
          border-radius: var(--radius-xl);
        }
        .aix-carousel .swiper-pagination-bullet {
          background: var(--color-gray-300);
          opacity: 1;
          transition: background-color 150ms ease-out;
        }
        .dark .aix-carousel .swiper-pagination-bullet {
          background: var(--color-gray-600);
        }
        .aix-carousel .swiper-pagination-bullet-active,
        .dark .aix-carousel .swiper-pagination-bullet-active {
          background: var(--color-brand-500);
        }
        .aix-carousel .swiper-pagination-bullet:focus-visible {
          outline: 2px solid rgba(244, 121, 32, 0.5);
          outline-offset: 2px;
        }
        .aix-carousel {
          padding-bottom: 8px;
        }
      `}</style>
    </div>
  );
};

export default Carousel;

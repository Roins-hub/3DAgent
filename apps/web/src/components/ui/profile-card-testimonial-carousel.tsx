"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface DeveloperContact {
  name: string;
  title: string;
  email: string;
  phone: string;
  imageUrl: string;
  qrUrl: string;
}

const developers: DeveloperContact[] = [
  {
    name: "贝钰峰",
    title: "项目负责人",
    email: "3296992750@qq.com",
    phone: "15816614118",
    imageUrl: "/contact/dev-1-new.jpg",
    qrUrl: "/contact/wechat-1.png",
  },
  {
    name: "马新伟",
    title: "前后端工程师",
    email: "2676353587@qq.com",
    phone: "15875648680",
    imageUrl: "/contact/dev-2.svg",
    qrUrl: "/contact/wechat-2.jpg",
  },
  {
    name: "开发者三",
    title: "图片生成开发者",
    email: "3601670045@qq.com",
    phone: "13417968512",
    imageUrl: "/contact/dev-3.svg",
    qrUrl: "/contact/wechat-3.jpg",
  },
];

const fadeVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
    transition: { duration: 0.24, ease: [0.55, 0, 1, 0.45] },
  },
};

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <a className="contact-row" href={href}>
      <span>
        <Icon size={18} />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </a>
  );
}

export interface TestimonialCarouselProps {
  className?: string;
}

export function TestimonialCarousel({ className }: TestimonialCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [qrOpen, setQrOpen] = useState(false);
  const currentDeveloper = developers[currentIndex];

  const handleNext = () => {
    setQrOpen(false);
    setCurrentIndex((index) => (index + 1) % developers.length);
  };
  const handlePrevious = () => {
    setQrOpen(false);
    setCurrentIndex((index) => (index - 1 + developers.length) % developers.length);
  };

  return (
    <div className={cn("contact-carousel", className)}>
      <div className="contact-carousel-stage">
        <div className="contact-photo-shell">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentDeveloper.imageUrl}
              className="contact-photo"
              variants={fadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Image
                src={currentDeveloper.imageUrl}
                alt={currentDeveloper.name}
                fill
                sizes="(max-width: 900px) 410px 470px"
                className="contact-photo-image"
                priority
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <section className="contact-card">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentDeveloper.email}
              variants={fadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <h2>{currentDeveloper.name}</h2>
              <p className="contact-title">{currentDeveloper.title}</p>

              <div className="contact-info-list">
                <ContactRow
                  icon={Mail}
                  label="邮箱"
                  value={currentDeveloper.email}
                  href={`mailto:${currentDeveloper.email}`}
                />
                <ContactRow
                  icon={Phone}
                  label="手机"
                  value={currentDeveloper.phone}
                  href={`tel:${currentDeveloper.phone}`}
                />
              </div>

              <button
                className="contact-qr-panel"
                type="button"
                onClick={() => setQrOpen(true)}
              >
                <Image
                  src={currentDeveloper.qrUrl}
                  alt={`${currentDeveloper.name} 微信二维码`}
                  width={84}
                  height={84}
                />
                <span>
                  <MessageCircle size={18} />
                  微信二维码
                  <small>点击放大</small>
                </span>
              </button>
            </motion.div>
          </AnimatePresence>
        </section>
      </div>

      <div className="contact-carousel-controls">
        <button onClick={handlePrevious} aria-label="上一位开发者">
          <ChevronLeft size={24} />
        </button>
        <div>
          {developers.map((developer, index) => (
            <button
              key={developer.email}
              aria-label={developer.name}
              className={cn(index === currentIndex && "is-active")}
              onClick={() => setCurrentIndex(index)}
            />
          ))}
        </div>
        <button onClick={handleNext} aria-label="下一位开发者">
          <ChevronRight size={24} />
        </button>
      </div>

      <AnimatePresence>
        {qrOpen ? (
          <motion.div
            className="contact-qr-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQrOpen(false)}
          >
            <motion.section
              className="contact-qr-modal-card"
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className="contact-qr-close"
                type="button"
                aria-label="关闭二维码"
                onClick={() => setQrOpen(false)}
              >
                <X size={22} />
              </button>
              <Image
                src={currentDeveloper.qrUrl}
                alt={`${currentDeveloper.name} 微信二维码放大图`}
                width={520}
                height={520}
                priority
              />
              <h3>{currentDeveloper.name}</h3>
              <p>微信二维码</p>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

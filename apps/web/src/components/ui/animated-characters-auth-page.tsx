"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

function EyeBall({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = "white",
  pupilColor = "black",
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) {
  const [pupilPosition, setPupilPosition] = useState({ x: 0, y: 0 });
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!eyeRef.current) return;

      const eye = eyeRef.current.getBoundingClientRect();
      const eyeCenterX = eye.left + eye.width / 2;
      const eyeCenterY = eye.top + eye.height / 2;
      const deltaX = event.clientX - eyeCenterX;
      const deltaY = event.clientY - eyeCenterY;
      const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
      const angle = Math.atan2(deltaY, deltaX);

      setPupilPosition({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [maxDistance]);

  const currentPupilPosition =
    forceLookX !== undefined && forceLookY !== undefined
      ? { x: forceLookX, y: forceLookY }
      : pupilPosition;

  return (
    <div
      ref={eyeRef}
      className="flex items-center justify-center rounded-full transition-all duration-150"
      style={{
        width: `${size}px`,
        height: isBlinking ? "2px" : `${size}px`,
        backgroundColor: eyeColor,
        overflow: "hidden",
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            transform: `translate(${currentPupilPosition.x}px, ${currentPupilPosition.y}px)`,
            transition: "transform 100ms ease-out",
          }}
        />
      )}
    </div>
  );
}

interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}

function Pupil({
  size = 12,
  maxDistance = 5,
  pupilColor = "black",
  forceLookX,
  forceLookY,
}: PupilProps) {
  const [pupilPosition, setPupilPosition] = useState({ x: 0, y: 0 });
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!pupilRef.current) return;

      const pupil = pupilRef.current.getBoundingClientRect();
      const pupilCenterX = pupil.left + pupil.width / 2;
      const pupilCenterY = pupil.top + pupil.height / 2;
      const deltaX = event.clientX - pupilCenterX;
      const deltaY = event.clientY - pupilCenterY;
      const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
      const angle = Math.atan2(deltaY, deltaX);

      setPupilPosition({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [maxDistance]);

  const currentPupilPosition =
    forceLookX !== undefined && forceLookY !== undefined
      ? { x: forceLookX, y: forceLookY }
      : pupilPosition;

  return (
    <div
      ref={pupilRef}
      className="rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        transform: `translate(${currentPupilPosition.x}px, ${currentPupilPosition.y}px)`,
        transition: "transform 100ms ease-out",
      }}
    />
  );
}

function useBlink() {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const scheduleBlink = () => {
      timeout = setTimeout(
        () => {
          setIsBlinking(true);
          setTimeout(() => {
            setIsBlinking(false);
            scheduleBlink();
          }, 150);
        },
        Math.random() * 4000 + 3000,
      );
    };

    scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  return isBlinking;
}

export function AuthCharacterScene({
  isTyping,
  password,
  showPassword,
}: {
  isTyping: boolean;
  password: string;
  showPassword: boolean;
}) {
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);
  const [positions, setPositions] = useState({
    purple: { faceX: 0, faceY: 0, bodySkew: 0 },
    black: { faceX: 0, faceY: 0, bodySkew: 0 },
    yellow: { faceX: 0, faceY: 0, bodySkew: 0 },
    orange: { faceX: 0, faceY: 0, bodySkew: 0 },
  });
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  const isPurpleBlinking = useBlink();
  const isBlackBlinking = useBlink();

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>) => {
        if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };

        const rect = ref.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 3;
        const deltaX = event.clientX - centerX;
        const deltaY = event.clientY - centerY;

        return {
          faceX: Math.max(-15, Math.min(15, deltaX / 20)),
          faceY: Math.max(-10, Math.min(10, deltaY / 30)),
          bodySkew: Math.max(-6, Math.min(6, -deltaX / 120)),
        };
      };

      setPositions({
        purple: calculatePosition(purpleRef),
        black: calculatePosition(blackRef),
        yellow: calculatePosition(yellowRef),
        orange: calculatePosition(orangeRef),
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    if (!isTyping) {
      return;
    }

    const startTimer = setTimeout(() => setIsLookingAtEachOther(true), 0);
    const timer = setTimeout(() => setIsLookingAtEachOther(false), 900);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(timer);
    };
  }, [isTyping]);

  useEffect(() => {
    if (!password || !showPassword) {
      return;
    }

    const timer = setTimeout(
      () => {
        setIsPurplePeeking(true);
        setTimeout(() => setIsPurplePeeking(false), 900);
      },
      Math.random() * 2400 + 900,
    );

    return () => clearTimeout(timer);
  }, [password, showPassword, isPurplePeeking]);

  const purplePos = positions.purple;
  const blackPos = positions.black;
  const yellowPos = positions.yellow;
  const orangePos = positions.orange;
  const passwordIsHidden = password.length > 0 && !showPassword;
  const passwordIsVisible = password.length > 0 && showPassword;
  const lookingAtEachOther = isTyping && isLookingAtEachOther;
  const purplePeeking = passwordIsVisible && isPurplePeeking;

  return (
    <div className="relative h-[430px] w-[580px] max-w-full">
      <div
        ref={purpleRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: "82px",
          width: "190px",
          height: isTyping || passwordIsHidden ? "430px" : "390px",
          backgroundColor: "#6c3ff5",
          borderRadius: "12px 12px 0 0",
          zIndex: 1,
          transform: passwordIsVisible
            ? "skewX(0deg)"
            : isTyping || passwordIsHidden
              ? `skewX(${purplePos.bodySkew - 12}deg) translateX(44px)`
              : `skewX(${purplePos.bodySkew}deg)`,
          transformOrigin: "bottom center",
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-700 ease-in-out"
          style={{
            left: passwordIsVisible
              ? "22px"
              : lookingAtEachOther
                ? "58px"
                : `${48 + purplePos.faceX}px`,
            top: passwordIsVisible
              ? "36px"
              : lookingAtEachOther
                ? "66px"
                : `${42 + purplePos.faceY}px`,
          }}
        >
          {[0, 1].map((eye) => (
            <EyeBall
              key={eye}
              size={20}
              pupilSize={8}
              maxDistance={5}
              eyeColor="white"
              pupilColor="#2d2d2d"
              isBlinking={isPurpleBlinking}
              forceLookX={passwordIsVisible ? (purplePeeking ? 5 : -5) : lookingAtEachOther ? 3 : undefined}
              forceLookY={passwordIsVisible ? (purplePeeking ? 6 : -5) : lookingAtEachOther ? 4 : undefined}
            />
          ))}
        </div>
      </div>

      <div
        ref={blackRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: "256px",
          width: "130px",
          height: "318px",
          backgroundColor: "#2d2d2d",
          borderRadius: "10px 10px 0 0",
          zIndex: 2,
          transform: passwordIsVisible
            ? "skewX(0deg)"
            : lookingAtEachOther
              ? `skewX(${blackPos.bodySkew * 1.5 + 10}deg) translateX(20px)`
              : `skewX(${isTyping || passwordIsHidden ? blackPos.bodySkew * 1.5 : blackPos.bodySkew}deg)`,
          transformOrigin: "bottom center",
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-700 ease-in-out"
          style={{
            left: passwordIsVisible
              ? "12px"
              : lookingAtEachOther
                ? "34px"
                : `${28 + blackPos.faceX}px`,
            top: passwordIsVisible
              ? "30px"
              : lookingAtEachOther
                ? "14px"
                : `${34 + blackPos.faceY}px`,
          }}
        >
          {[0, 1].map((eye) => (
            <EyeBall
              key={eye}
              size={18}
              pupilSize={7}
              maxDistance={4}
              eyeColor="white"
              pupilColor="#2d2d2d"
              isBlinking={isBlackBlinking}
              forceLookX={passwordIsVisible ? -4 : lookingAtEachOther ? 0 : undefined}
              forceLookY={passwordIsVisible ? -4 : lookingAtEachOther ? -4 : undefined}
            />
          ))}
        </div>
      </div>

      <div
        ref={orangeRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: "0px",
          width: "250px",
          height: "210px",
          zIndex: 3,
          backgroundColor: "#ff9b6b",
          borderRadius: "125px 125px 0 0",
          transform: passwordIsVisible ? "skewX(0deg)" : `skewX(${orangePos.bodySkew}deg)`,
          transformOrigin: "bottom center",
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-200 ease-out"
          style={{
            left: passwordIsVisible ? "52px" : `${86 + orangePos.faceX}px`,
            top: passwordIsVisible ? "88px" : `${94 + orangePos.faceY}px`,
          }}
        >
          {[0, 1].map((eye) => (
            <Pupil
              key={eye}
              size={13}
              maxDistance={6}
              pupilColor="#2d2d2d"
              forceLookX={passwordIsVisible ? -5 : undefined}
              forceLookY={passwordIsVisible ? -4 : undefined}
            />
          ))}
        </div>
      </div>

      <div
        ref={yellowRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: "332px",
          width: "148px",
          height: "242px",
          backgroundColor: "#e8d754",
          borderRadius: "74px 74px 0 0",
          zIndex: 4,
          transform: passwordIsVisible ? "skewX(0deg)" : `skewX(${yellowPos.bodySkew}deg)`,
          transformOrigin: "bottom center",
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-200 ease-out"
          style={{
            left: passwordIsVisible ? "22px" : `${54 + yellowPos.faceX}px`,
            top: passwordIsVisible ? "38px" : `${42 + yellowPos.faceY}px`,
          }}
        >
          {[0, 1].map((eye) => (
            <Pupil
              key={eye}
              size={13}
              maxDistance={6}
              pupilColor="#2d2d2d"
              forceLookX={passwordIsVisible ? -5 : undefined}
              forceLookY={passwordIsVisible ? -4 : undefined}
            />
          ))}
        </div>
        <div
          className="absolute h-1 w-20 rounded-full bg-[#2d2d2d] transition-all duration-200 ease-out"
          style={{
            left: passwordIsVisible ? "12px" : `${42 + yellowPos.faceX}px`,
            top: passwordIsVisible ? "92px" : `${92 + yellowPos.faceY}px`,
          }}
        />
      </div>
    </div>
  );
}

export function AuthSplitPage({
  children,
  title,
  subtitle,
  eyebrow,
  actionHref,
  actionLabel,
  isTyping,
  password,
  showPassword,
  showFooterAction = true,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  eyebrow: string;
  actionHref: string;
  actionLabel: string;
  isTyping: boolean;
  password: string;
  showPassword: boolean;
  showFooterAction?: boolean;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[minmax(520px,0.95fr)_minmax(520px,1.05fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#191919] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_45%,rgba(255,255,255,0.14),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_36%)]" />
        <div className="absolute inset-0 auth-grid" />
        <Link href="/" className="relative z-10 flex items-center gap-3 text-lg font-semibold">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/12 text-white backdrop-blur">
            <Sparkles className="size-5" />
          </span>
          <span>智模精工</span>
        </Link>
        <div className="relative z-10 flex flex-1 items-end justify-center pb-12">
          <AuthCharacterScene
            isTyping={isTyping}
            password={password}
            showPassword={showPassword}
          />
        </div>
        <div className="relative z-10 flex items-center gap-8 text-sm text-white/55">
          <span>Privacy Policy</span>
          <span>Terms of Service</span>
          <span>Contact</span>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-10 lg:px-12">
        <div className="w-full max-w-[460px]">
          <div className="mb-12 flex items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-3 text-lg font-semibold">
              <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
                <Sparkles className="size-5" />
              </span>
              <span>智模精工</span>
            </Link>
            <Link className="text-sm font-semibold text-muted-foreground" href={actionHref}>
              {actionLabel}
            </Link>
          </div>

          <div className="mb-10 text-center">
            <p className="mb-3 text-sm font-semibold text-muted-foreground">{eyebrow}</p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-3 text-base text-muted-foreground">{subtitle}</p>
          </div>

          {children}

          {showFooterAction && (
          <div className="mt-8 hidden justify-center lg:flex">
            <Link
              className={cn(
                "rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground",
              )}
              href={actionHref}
            >
              {actionLabel}
            </Link>
          </div>
          )}
        </div>
      </section>
    </main>
  );
}

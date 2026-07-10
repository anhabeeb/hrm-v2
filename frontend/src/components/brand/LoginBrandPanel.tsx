import { APP_BRANDING } from "../../config/branding";

export function LoginBrandPanel() {
  return (
    <section
      className="relative flex w-full flex-col items-center justify-center gap-4 bg-[#5B4FE9] px-8 py-10 text-center lg:w-1/2 lg:py-12"
      aria-label={`${APP_BRANDING.appName} brand`}
    >
      <div className="flex flex-col items-center gap-8">
        <img
          src={APP_BRANDING.appLogoAnimationOnColor}
          alt="OmniCore - HR logo"
          className="h-auto w-full max-w-[180px] object-contain sm:max-w-[220px] lg:hidden"
          draggable={false}
        />
        <div className="relative hidden h-44 w-44 lg:block" aria-hidden="true">
          <span className="oc-ripple-ring" style={{ top: "50%", left: "50%", width: 228, height: 228, margin: "-114px 0 0 -114px" }} />
          <span className="oc-ripple-ring oc-ripple-ring--alt" style={{ top: "50%", left: "50%", width: 228, height: 228, margin: "-114px 0 0 -114px" }} />
          <div className="oc-core-ring absolute inset-0" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-2xl tracking-tight text-white sm:text-3xl" style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600 }}>
            {APP_BRANDING.appName}
          </p>
          <p className="text-sm text-white/75">{APP_BRANDING.tagline}</p>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-8 hidden items-center justify-center gap-2 text-xs text-white/50 lg:flex">
        <span>Product of</span>
        <span className="inline-flex items-center gap-1">
          <svg viewBox="0 0 100 100" width="16" height="16" style={{ overflow: "visible" }} aria-hidden="true">
            <circle cx="50" cy="50" r="33" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="2.5" />
            <g className="omni-orbit-spin">
              <circle cx="50" cy="17" r="8" fill="#fff" />
              <circle cx="83" cy="50" r="8" fill="#fff" />
              <circle cx="50" cy="83" r="8" fill="#fff" />
              <circle cx="17" cy="50" r="8" fill="#fff" />
            </g>
            <circle cx="50" cy="50" r="10.5" fill="#fff" />
          </svg>
          <span>OmniSystems</span>
        </span>
      </div>
    </section>
  );
}

import { APP_BRANDING } from "../../config/branding";

export function LoginBrandPanel() {
  return (
    <section className="flex w-full justify-center px-4 py-6 sm:px-6 lg:px-8" aria-label={`${APP_BRANDING.appName} brand`}>
      <div className="flex w-full max-w-[620px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-panel sm:px-10 lg:min-h-[500px]">
        <div className="flex w-full flex-col items-center justify-center gap-6 text-center">
          <img
            src="/brand/omnicore-logo-animation.svg"
            alt="OmniCore - HR logo"
            className="h-auto w-full max-w-[300px] object-contain sm:max-w-[420px] lg:max-w-[500px]"
            draggable={false}
          />
          <p className="text-2xl font-semibold tracking-wide text-slate-900 sm:text-3xl">{APP_BRANDING.appName}</p>
        </div>
      </div>
    </section>
  );
}

import { APP_BRANDING } from "../../config/branding";

export function LoginBrandPanel() {
  return (
    <section className="flex w-full justify-center px-4 py-6 sm:px-6 lg:px-8" aria-label={`${APP_BRANDING.appName} brand`}>
      <div className="flex w-full max-w-[640px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-panel sm:px-10 lg:min-h-[560px]">
        <div className="flex w-full flex-col items-center justify-center gap-7 text-center">
          <img
            src={APP_BRANDING.appLogoAnimation}
            alt="OmniCore - HR logo"
            className="h-auto w-full max-w-[300px] object-contain sm:max-w-[420px] lg:max-w-[560px] xl:max-w-[600px]"
            draggable={false}
          />
          <p className="text-2xl font-semibold tracking-wide text-slate-900 sm:text-3xl">{APP_BRANDING.appName}</p>
        </div>
      </div>
    </section>
  );
}

"""log 일평균의 유형·시도 부분 풀링과 가중 Student-t 우도를 PyMC로 적합한다."""

from typing import Any

import numpy as np
import polars as pl
from crowdcast.models.challenger.config import ChallengerConfig
from crowdcast.models.challenger.encoding import fit_encoding, group_values, matrix
from crowdcast.models.challenger.posterior import Posterior


# PyMC는 명시적으로 도전 모델을 학습할 때만 읽어 기본 예보의 의존 경로와 분리한다.
def fit(
    training: pl.DataFrame,
    names: list[str],
    events: dict[str, dict[str, Any]],
    model_config: dict[str, Any],
    config: ChallengerConfig,
) -> Posterior:
    import pymc as pm
    import pytensor
    from pytensor.compile.mode import Mode

    # 학습 표본만 중심화하며 평가 정답과 보정 정답은 이 함수에 전달하지 않는다.
    y = training["daily_mean"].to_numpy()
    if not len(y) or not np.isfinite(y).all() or np.any(y <= 0):
        raise ValueError("도전 모델 학습 라벨은 유한한 양수여야 합니다")
    y = np.log(y)
    center = float(np.mean(y))
    encoding = fit_encoding(training, names, events)
    x, groups = matrix(training, encoding), group_values(training, events)
    weights = np.where(
        training["label_tier"].to_numpy() == "silver",
        model_config["silver_weight"],
        model_config["gold_weight"],
    )
    if not np.isfinite(weights).all() or np.any(weights <= 0):
        raise ValueError("도전 모델 라벨 가중치는 유한한 양수여야 합니다")
    # 작은 자료에서는 C·JIT 최초 컴파일 없이 Python 연산자를 써서 테스트·전체 실행 시간을 제한한다.
    compile_kwargs = {"mode": Mode(linker="py", optimizer="fast_compile")}
    with pm.Model(), pytensor.config.change_flags(mode=compile_kwargs["mode"]):
        intercept = pm.Normal("intercept", mu=center, sigma=2.0)
        beta = pm.Normal("beta", mu=0, sigma=0.5, shape=x.shape[1])
        mu = intercept + pm.math.dot(x, beta)
        for name in ("type", "sido"):
            levels = encoding["groups"][name]
            scale = pm.HalfNormal(f"{name}_scale", sigma=0.75)
            z = pm.Normal(f"{name}_z", mu=0, sigma=1, shape=len(levels))
            effect = pm.Deterministic(f"{name}_effect", scale * z)
            mu = mu + effect[np.array([levels.index(value) for value in groups[name]])]
        sigma = pm.HalfNormal("sigma", sigma=1.0)
        nu = pm.Deterministic("nu", 2 + pm.Exponential("nu_minus_two", lam=0.1))
        likelihood = pm.logp(pm.StudentT.dist(nu=nu, mu=mu, sigma=sigma), y)
        pm.Potential("weighted_likelihood", (weights * likelihood).sum())

        # 속도 목적의 평균장 근사를 명시하며 MCMC가 선택되면 체인을 한 프로세스에서 순서대로 돌린다.
        diagnostics: dict[str, Any] = {"convergence_confirmed": False}
        if config.method == "advi":
            approximation = pm.fit(
                n=config.iterations,
                method="advi",
                random_seed=config.seed,
                progressbar=False,
                compile_kwargs=compile_kwargs,
            )
            if not np.isfinite(approximation.hist).all():
                raise ValueError("ADVI 목적함수에 비유한 값이 있습니다")
            trace = approximation.sample(draws=config.draws, random_seed=config.seed)
            diagnostics.update(
                loss_first=float(approximation.hist[0]),
                loss_last=float(approximation.hist[-1]),
            )
        else:
            trace = pm.sample(
                draws=config.draws,
                tune=config.tune,
                chains=config.chains,
                cores=1,
                random_seed=config.seed,
                progressbar=False,
                compute_convergence_checks=False,
                compile_kwargs=compile_kwargs,
            )
            diagnostics["divergences"] = int(trace.sample_stats["diverging"].values.sum())

    # 분위수 계산에 필요한 계수만 평탄화하고 학습 행별 추적·난수 상태는 저장하지 않는다.
    variables = ("intercept", "beta", "type_effect", "sido_effect", "type_scale", "sido_scale", "sigma", "nu")
    samples = {}
    for name in variables:
        raw = trace.posterior[name].values
        samples[name] = raw.reshape((raw.shape[0] * raw.shape[1], *raw.shape[2:]))
        if not np.isfinite(samples[name]).all():
            raise ValueError(f"사후 표본에 비유한 값이 있습니다: {name}")
    return Posterior(
        encoding,
        samples,
        {
            "config": config.document(),
            "pymc_version": pm.__version__,
            "diagnostics": diagnostics,
            "training_ids": training["event_id"].to_list(),
            "likelihood": "weighted Student-t on log(daily_mean)",
            "labels_available_at": training["available_at"].max().isoformat(),
            "weights": {"gold": model_config["gold_weight"], "silver": model_config["silver_weight"]},
        },
    )

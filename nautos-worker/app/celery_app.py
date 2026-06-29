from celery import Celery
from celery.signals import worker_init

from app.config import settings

celery = Celery(
    "nautos",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

celery.autodiscover_tasks(["app.tasks"])


@worker_init.connect
def init_sentry_for_celery(**kwargs: object) -> None:
    """
    Initialise Sentry in the Celery worker process.

    The worker_init signal fires once per worker process after the worker
    has started but before it begins consuming tasks — the ideal moment
    to set up Sentry so that task errors are captured with full context.
    """
    from sentry_init import init_sentry  # noqa: PLC0415

    init_sentry(runtime="celery")


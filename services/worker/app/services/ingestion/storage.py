import boto3
from app.config import settings


class StorageService:
    def __init__(self):
        self.s3 = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        self.bucket = settings.aws_s3_bucket

    def download(self, s3_key: str) -> bytes:
        response = self.s3.get_object(Bucket=self.bucket, Key=s3_key)
        return response["Body"].read()

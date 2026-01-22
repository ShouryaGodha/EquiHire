from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import os

pdf_path = "data/test_resume.pdf"
os.makedirs("data", exist_ok=True)

c = canvas.Canvas(pdf_path, pagesize=letter)
y = 750
c.setFont("Helvetica-Bold", 18)
c.drawString(50, y, "Emily Watson")
y -= 25
c.setFont("Helvetica", 11)
c.drawString(50, y, "emily.watson@email.com | Denver, CO")
y -= 35
c.setFont("Helvetica-Bold", 14)
c.drawString(50, y, "SUMMARY")
y -= 20
c.setFont("Helvetica", 11)
c.drawString(50, y, "Senior Data Engineer with 6 years experience in data pipelines.")
y -= 15
c.drawString(50, y, "Expert in Python, Spark, and cloud technologies.")
y -= 35
c.setFont("Helvetica-Bold", 14)
c.drawString(50, y, "EXPERIENCE")
y -= 20
c.setFont("Helvetica-Bold", 11)
c.drawString(50, y, "Senior Data Engineer | DataCorp | 2020 - Present")
y -= 15
c.setFont("Helvetica", 10)
c.drawString(60, y, "- Built ETL pipelines processing 500GB daily using Apache Spark")
y -= 15
c.drawString(60, y, "- Designed data warehouse architecture on AWS Redshift")
y -= 30
c.setFont("Helvetica-Bold", 14)
c.drawString(50, y, "SKILLS")
y -= 20
c.setFont("Helvetica", 11)
c.drawString(
    50, y, "Python, Apache Spark, Airflow, Kafka, AWS, PostgreSQL, Docker, Kubernetes"
)
c.save()
print(f"Created: {pdf_path} ({os.path.getsize(pdf_path)} bytes)")

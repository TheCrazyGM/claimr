# RC Cost Chart

A modern Flask web application for tracking and visualizing Hive blockchain Resource Credit (RC) claim costs over time. Designed for Hive power users, witnesses, and tool builders who want insights into RC claim trends and easy account claiming.

---

## Features

- **Live RC Claim Cost Chart:** Visualize RC claim costs over time with ApexCharts.
- **Most Recent RC Cost:** Prominently display the latest claim cost and timestamp.
- **Claim Account(s):** Check your RC, see how many accounts you can claim, and broadcast claim operations via Hive Keychain.
- **Responsive UI:** Modern, mobile-friendly interface using Bootstrap 5.
- **Dark Navbar & Footer:** Clean, professional look.
- **Accessibility:** ARIA labels, keyboard navigation, and color contrast.

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/thecrazygm/claimr.git
cd claimr
```

### 2. Install Dependencies

```bash
uv sync
source .venv/bin/activate
```

### 3. Set Environment Variables

Create a `.env` file (or set in your environment):

```env
RC_COST_DB_PATH=sqlite:///rc_costs.db
```

### 4. Initialize the Database

The database will be auto-created on first run. To log the latest RC cost:

```bash
python log_rc_cost.py
```

### 5. Run the Web App

```bash
flask run
# or
python run.py
```

Visit [http://localhost:5000](http://localhost:5000)

## Project Structure

```bash
claimr/
├── app/
│   ├── __init__.py
│   ├── views.py
│   ├── templates/
│   │   ├── base.html
│   │   ├── index.html
│   │   ├── claim_account.html
│   │   └── claim_success.html
│   └── static/
│       ├── css/
│       │   └── style.css
│       ├── js/
│       │   ├── main.js
│       │   └── rc_chart.js
│       └── img/
├── log_rc_cost.py
├── run.py
├── wsgi.py
├── crontab.txt
├── run_log_rc_cost_cron.sh
├── pyproject.toml
├── .env.example
├── .gitignore
├── .prettierrc
├── LICENSE
└── README.md
```

## Environment Variables

- `RC_COST_DB_PATH`: SQLAlchemy connection string for the RC cost database (default: `sqlite:///rc_costs.db`).

## Dependencies

- Flask
- Bootstrap 5 & Bootstrap Icons
- ApexCharts
- dataset
- nectar (Hive blockchain library)
- python-dotenv

Install all with:

```bash
uv sync
```

## Contributing

Pull requests, issues, and feature suggestions are welcome! Please open an issue or PR on GitHub.

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Credits

- Built by [TheCrazyGM](https://thecrazygm.com)
- Uses [nectar](https://github.com/hive-engine/nectar) for Hive blockchain access
- UI inspired by The Crazy GM tool suite

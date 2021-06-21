const { ipcRenderer } = require("electron");
const puppeteer = require("puppeteer");
const rootPath = require("electron-root-path").rootPath;
const shell = require("electron").shell;

const major: string =
  "https://www.seoulauction.com/currentAuction?sale_kind=offline_only&page=1&lang=ko#page";
const online: string =
  "https://www.seoulauction.com/currentAuction?sale_kind=online_only&page=1&lang=ko#page1";
const artsy: string =
  "https://www.seoulauction.com/currentAuction?sale_outside_yn=Y&lang=ko#page1";

const urlList: object = {
  major: { url: major },
  online: { url: online },
  artsy: { url: artsy },
};
const auctionList: string[] = ["major", "online", "artsy"];

async function configureBrowser() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    args: ["--window-size=1280,1080"],
  });
  return browser;
}

async function goPage(browser: any, url: string) {
  const page = await browser.newPage();
  //access the website
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

async function parsing(page: any) {
  console.log("parsing start");
  let description: object = await page.evaluate((html: any) => {
    let number = html.querySelector(
      ".author span.ng-binding.ng-scope"
    )?.innerText;

    let artistKr = html.querySelector(".author .name")?.innerText;

    let artistEn = html
      .querySelector(".author .lang")
      ?.innerText.replace(/[^a-zA-Z]*$/, "");

    let titleKr = html.querySelector(".tit p:nth-child(1)").innerText;
    let titleEn = html.querySelector(".tit p:nth-child(2)").innerText;
    if (!/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(titleKr)) {
      titleEn = titleKr;
      titleKr = "";
    }

    let material = html.querySelector(
      'span[ng-if="lot.MATE_NM_EN"]'
    )?.innerText;

    let size = html.querySelector(
      'p[ng-repeat="size in lot.LOT_SIZE_JSON"]'
    )?.innerText;
    let edition = html.querySelector(
      ".title .mat span[ng-bind='lot.EDITION']"
    )?.innerText;
    edition = edition == undefined ? "" : edition;
    let sizeEdition = size + " " + edition;
    let year = html.querySelector(
      'p[ng-if="lot.MAKE_YEAR_JSON[locale]"]'
    )?.innerText;

    let signPosition = html.querySelector(
      'p[ng-if="lot.SIGN_INFO_JSON[locale]"] > span> span:nth-child(1)'
    )?.innerText;

    let estimate = html.querySelector(
      ".price .mat > div p:nth-child(1)"
    )?.innerText;

    let estimateUnit = estimate?.replace(/[^a-zA-z\s]/g, "").trim();
    let estimateMin = estimate
      ?.split("~")[0]
      .replace(/[a-zA-z\s]/g, "")
      .trim();
    let estimateMax = estimate?.split("~")[1];

    let materialKr = material?.replace(/[^ㄱ-ㅎ|가-힣|\s]/g, "").trim();
    let materialEn = material?.replace(/[ㄱ-ㅎ|가-힣]/g, "").trim();

    let certi = "";
    let auctionTitle = html.querySelector("title")?.innerText;
    number = number == undefined ? "" : number;
    artistKr = artistKr == undefined ? "" : artistKr;
    artistEn = artistEn == undefined ? "" : artistEn;
    titleKr = titleKr == undefined ? "" : titleKr;
    titleEn = titleEn == undefined ? "" : titleEn;
    year = year == undefined ? "" : year;
    certi = certi == undefined ? "" : certi;
    sizeEdition = sizeEdition == undefined ? "" : sizeEdition;
    materialKr = materialKr == undefined ? "" : materialKr;
    materialEn = materialEn == undefined ? "" : materialEn;
    signPosition = signPosition == undefined ? "" : signPosition;
    auctionTitle = auctionTitle == undefined ? "" : auctionTitle;
    estimateUnit = estimateUnit == undefined ? "" : estimateUnit;
    estimateMin = estimateMin == undefined ? "" : estimateMin;
    estimateMax = estimateMax == undefined ? "" : estimateMax;
    return {
      auctionTitle,
      number,
      artistKr,
      artistEn,
      titleKr,
      titleEn,
      year,
      certi,
      sizeEdition,
      materialKr,
      materialEn,
      signPosition,
      estimateUnit,
      estimateMin,
      estimateMax,
    };
  });
  return description;
}

async function scraper(page: any) {
  let outerDesc: object;
  let innerDesc: object;
  let description: object[] = [];

  //get title
  const elem_title = await page.waitForSelector("div.title", { timeout: 9000 });
  const auctionTitle: object = await elem_title.evaluate((html: any) => {
    const source = html.querySelector(
      'div.tit > span[ng-bind="sale.TITLE_JSON[locale]"]'
    )?.innerText;
    const transactDate = html.querySelector(
      "div.sub.lotlist_memobox > p.ng-scope > span.ng-binding"
    )?.innerText;
    return { source, transactDate };
  });
  outerDesc = { ...auctionTitle };

  outerDesc = { ...outerDesc };

  //get artworks
  await page.waitForSelector("ul#auctionList > li .info > a", {
    timeout: 9000,
  });
  let artworkIndex: number = 0;
  while (true) {
    const artworkList: any[] = await page.$$("#auctionList > li .info > a");
    console.log(`현재 페이지에 ${artworkList.length}개의 예술품이 있습니다.`);
    // check if artwork is exist or not
    if (artworkIndex == artworkList.length) break;

    //get winningBid
    let winningBidUnit: string = "";
    const elem_winnindgBid: any = await page.$(
      "strong[ng-class=\"{txt_impo:viewId == 'CURRENT_AUCTION'}\"]"
    );
    let winnindgBid: string =
      elem_winnindgBid == null
        ? ""
        : elem_winnindgBid.evaluate((html: any) => {
            return html?.innerText;
          });

    // go to detailPage
    await Promise.all([
      artworkList[artworkIndex].click(),
      page.waitForNavigation(),
    ]);
    const detailPage = await page.waitForSelector("div.master_detail", {
      timeout: 9000,
    });

    //parsing detailPage
    innerDesc = await parsing(detailPage);
    if (innerDesc == undefined) console.error("파싱에 문제가 있습니다.");

    description.push({
      ...outerDesc,
      ...innerDesc,
      winnindgBid,
      winningBidUnit,
    });

    //go back
    await Promise.all([page.goBack(), page.waitForNavigation()]);
    await page.waitForTimeout("3000");
    artworkIndex++;
  }

  console.log(description);
  return description;
}

async function run() {
  let result: object[] = [];
  const browser = await configureBrowser();
  let pageIndex: number = 1;
  while (true) {
    const page = await goPage(browser, major + pageIndex);
    // check if page is active or not
    const elem_artworkList = await page.$(".auction_h_list");
    if (elem_artworkList == null) break;
    // run scraper
    scraper(page)
      .then((res) => {
        //page res
        result.push(...res);
      })
      .catch((e) => {
        console.error(e);
        browser.close();
      });
    pageIndex++;
  }

  //  browser.close()
  return result;
}

run().then((res) => console.log("run", res));
